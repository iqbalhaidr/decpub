// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../ciko/interfaces/IReviewSubmissions.sol";
import "./interfaces/IEscrowPool.sol";
import "./interfaces/IReputationSBT.sol";

/**
 * IncentiveEngine: TOPSIS + sigmoid on-chain dan pembagian escrow ke penelaah.
 * Dari `Hugo/.../IncentiveEngine.sol`. `_topsis`, `_sigmoid`, dan `_sqrt` dipertahankan
 * apa adanya (matematikanya yang menghasilkan angka Lampiran B Hugo). Perubahan
 * (docs/arsitektur.md bagian 6.1, 6.2, 9, dan keputusan D1-D3):
 *
 *  - Escrow dipindah ke `EscrowPool`. Engine tidak memegang dana. Dana dikreditkan ke
 *    pseudonim (bukan alamat), diklaim penelaah ke alamat baru.
 *  - Berbasis `sessionId`, bukan `batchId` yang dihitung klien.
 *  - Baris matriks hanyalah pseudonim yang sudah reveal (D3), diperiksa lewat `hasReveal`.
 *    Tidak ada lagi mask `participated` dari operator dan baris no-show `[30,0,0,q4]`.
 *  - Validasi masukan yang di Hugo tidak ada: jumlah bobot tepat 1e18, nilai matriks <= 1e18,
 *    1-10 baris, tanpa pseudonim ganda, tanpa pseudonim tanpa reveal.
 *  - Sisa pembulatan masuk ke penelaah dengan nilai sigmoid tertinggi (di Hugo tertahan).
 *  - Hash laporan QoS (yang diunggah ke storage) dan hash kebijakan jurnal dicatat per sesi.
 *  - Reputasi tidak dicetak ke penerima. Engine hanya menambah kredit agregat di
 *    `ReputationSBT`, yang diklaim lewat bukti tanpa pseudonim.
 *
 * Batas kepercayaan: kontrak menjamin eksekusi sesuai masukan, bukan kebenaran masukan
 * (matriks dan bobot dari operator, seperti di Hugo). Daftar pseudonim juga dari operator:
 * operator bisa menghilangkan penelaah yang reveal. Ini batasan yang sama dengan `decideBatch`
 * Ciko. Operator tidak bisa menambahkan pseudonim tanpa reveal.
 */
contract IncentiveEngine {
    uint256 public constant PRECISION = 1e18;
    uint256 public constant NUM_CRITERIA = 4; // q1..q4
    /// D2: maksimal 10 baris per sesi.
    uint256 public constant MAX_REVIEWERS = 10;

    /// Masukan satu distribusi. Dibungkus struct supaya tidak stack-too-deep tanpa viaIR.
    struct DistributionInput {
        bytes32 sessionId;
        /// Matriks ternormalisasi n x 4, tiap nilai * 1e18 dan <= 1e18.
        uint256[][] matrix;
        /// Bobot fusi, jumlahnya tepat 1e18.
        uint256[4] weights;
        /// Pseudonim penelaah, satu per baris matriks. Semuanya sudah reveal.
        address[] pseudonyms;
        /// Hash laporan QoS lengkap yang diunggah ke storage publik.
        bytes32 qosReportHash;
        /// Hash kebijakan jurnal (preset BWM, lambda, gamma) yang dikunci saat sesi dibuat.
        bytes32 policyHash;
    }

    struct Distribution {
        bool executed;
        uint16 reviewerCount;
        uint64 executedAt;
        bytes32 qosReportHash;
        bytes32 policyHash;
    }

    address public admin;
    address public operator;
    IEscrowPool public immutable escrowPool;
    IReputationSBT public immutable reputationSBT;
    IReviewSubmissions public immutable reviewSubmissions;

    // f(S) = 1 / (1 + e^(-k*(S - x0))) (aproksimasi, lihat `_sigmoid`). Skala 1e18, global.
    uint256 public sigmoidK;
    uint256 public sigmoidX0;

    mapping(bytes32 => Distribution) public distributions;

    event SessionDistributed(
        bytes32 indexed sessionId,
        uint256[] scores,
        bytes32 qosReportHash,
        bytes32 policyHash
    );
    /// Pseudonim publik di ledger sejak reveal; yang tidak terhubung adalah pseudonim ke orang.
    event RewardCredited(bytes32 indexed sessionId, address indexed pseudonym, uint256 ethReward, uint256 reputationAmount);
    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event SigmoidParamsUpdated(uint256 k, uint256 x0);

    error OnlyAdmin();
    error OnlyOperator();
    error InvalidAddress();
    error InvalidSigmoidParams();
    error AlreadyDistributed();
    error NotDistributable();
    error InvalidReviewerCount();
    error MatrixMismatch();
    error InvalidMatrixValue();
    error WeightsMustSumToOne();
    error DuplicatePseudonym();
    error PseudonymNotRevealed(address pseudonym);
    error NoReward();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert OnlyOperator();
        _;
    }

    constructor(
        address escrowPool_,
        address reputationSBT_,
        address reviewSubmissions_,
        address operator_,
        uint256 sigmoidK_,
        uint256 sigmoidX0_
    ) {
        if (
            escrowPool_ == address(0) ||
            reputationSBT_ == address(0) ||
            reviewSubmissions_ == address(0) ||
            operator_ == address(0)
        ) revert InvalidAddress();
        if (sigmoidK_ == 0 || sigmoidX0_ > PRECISION) revert InvalidSigmoidParams();
        admin = msg.sender;
        operator = operator_;
        escrowPool = IEscrowPool(escrowPool_);
        reputationSBT = IReputationSBT(reputationSBT_);
        reviewSubmissions = IReviewSubmissions(reviewSubmissions_);
        sigmoidK = sigmoidK_;
        sigmoidX0 = sigmoidX0_;
    }

    // ================================================================
    // DISTRIBUSI
    // ================================================================

    /**
     * Menjalankan TOPSIS dan sigmoid atas baris pseudonim yang reveal, lalu mengkredit
     * seluruh escrow sesi ke mereka. Hanya sekali per sesi (state escrow berpindah ke Credited).
     * Hanya operator, dan hanya bila `EscrowPool.distributable(sessionId)`.
     */
    function executeDistribution(DistributionInput calldata input) external onlyOperator {
        bytes32 sessionId = input.sessionId;
        if (distributions[sessionId].executed) revert AlreadyDistributed();
        if (!escrowPool.distributable(sessionId)) revert NotDistributable();

        uint256 n = input.pseudonyms.length;
        if (n == 0 || n > MAX_REVIEWERS) revert InvalidReviewerCount();
        _validate(input, n);

        uint256[] memory scores = _topsis(input.matrix, input.weights, n);

        uint256[] memory sigmoidValues = new uint256[](n);
        uint256 sigmoidSum;
        for (uint256 i = 0; i < n; i++) {
            sigmoidValues[i] = _sigmoid(scores[i]);
            sigmoidSum += sigmoidValues[i];
        }
        if (sigmoidSum == 0) revert NoReward();

        uint256[] memory amounts = _split(escrowPool.escrowAmount(sessionId), sigmoidValues, sigmoidSum, n);

        distributions[sessionId] = Distribution({
            executed: true,
            reviewerCount: uint16(n),
            executedAt: uint64(block.timestamp),
            qosReportHash: input.qosReportHash,
            policyHash: input.policyHash
        });

        escrowPool.creditRewards(sessionId, input.pseudonyms, amounts);
        reputationSBT.accrue(sigmoidSum);

        for (uint256 i = 0; i < n; i++) {
            emit RewardCredited(sessionId, input.pseudonyms[i], amounts[i], sigmoidValues[i]);
        }
        emit SessionDistributed(sessionId, scores, input.qosReportHash, input.policyHash);
    }

    function _validate(DistributionInput calldata input, uint256 n) internal view {
        if (input.matrix.length != n) revert MatrixMismatch();

        uint256 weightSum;
        for (uint256 j = 0; j < NUM_CRITERIA; j++) weightSum += input.weights[j];
        if (weightSum != PRECISION) revert WeightsMustSumToOne();

        for (uint256 i = 0; i < n; i++) {
            if (input.matrix[i].length != NUM_CRITERIA) revert MatrixMismatch();
            for (uint256 j = 0; j < NUM_CRITERIA; j++) {
                if (input.matrix[i][j] > PRECISION) revert InvalidMatrixValue();
            }
            address p = input.pseudonyms[i];
            for (uint256 k = 0; k < i; k++) {
                if (input.pseudonyms[k] == p) revert DuplicatePseudonym();
            }
            if (!reviewSubmissions.hasReveal(input.sessionId, p)) revert PseudonymNotRevealed(p);
        }
    }

    /// Bagian ETH proporsional terhadap nilai sigmoid. Sisa pembulatan masuk ke nilai tertinggi.
    function _split(
        uint256 escrow,
        uint256[] memory sigmoidValues,
        uint256 sigmoidSum,
        uint256 n
    ) internal pure returns (uint256[] memory amounts) {
        amounts = new uint256[](n);
        uint256 assigned;
        uint256 top;
        for (uint256 i = 0; i < n; i++) {
            amounts[i] = (escrow * sigmoidValues[i]) / sigmoidSum;
            assigned += amounts[i];
            if (sigmoidValues[i] > sigmoidValues[top]) top = i;
        }
        amounts[top] += escrow - assigned;
    }

    // ================================================================
    // TOPSIS (dari Hugo, tidak diubah)
    // ================================================================

    /**
     * Input: matriks ternormalisasi (nilai di [0, PRECISION]) dan bobot. Normalisasi sudah
     * membalik arah cost, jadi PIS = max dan NIS = min untuk semua kriteria.
     * Kompleksitas O(n x m), n <= 10, m = 4.
     */
    function _topsis(
        uint256[][] calldata matrix,
        uint256[4] calldata weights,
        uint256 n
    ) internal pure returns (uint256[] memory) {
        uint256[4] memory pis;
        uint256[4] memory nis;
        for (uint256 j = 0; j < NUM_CRITERIA; j++) {
            nis[j] = type(uint256).max;
        }

        uint256[][] memory V = new uint256[][](n);
        for (uint256 i = 0; i < n; i++) {
            V[i] = new uint256[](NUM_CRITERIA);
            for (uint256 j = 0; j < NUM_CRITERIA; j++) {
                V[i][j] = (matrix[i][j] * weights[j]) / PRECISION;
                if (V[i][j] > pis[j]) pis[j] = V[i][j];
                if (V[i][j] < nis[j]) nis[j] = V[i][j];
            }
        }

        uint256[] memory scores = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 dPlusSq = 0;
            uint256 dMinusSq = 0;
            for (uint256 j = 0; j < NUM_CRITERIA; j++) {
                uint256 diffPlus = V[i][j] > pis[j] ? V[i][j] - pis[j] : pis[j] - V[i][j];
                uint256 diffMinus = V[i][j] > nis[j] ? V[i][j] - nis[j] : nis[j] - V[i][j];
                dPlusSq += diffPlus * diffPlus;
                dMinusSq += diffMinus * diffMinus;
            }

            uint256 dPlus = _sqrt(dPlusSq);
            uint256 dMinus = _sqrt(dMinusSq);

            uint256 denom = dPlus + dMinus;
            if (denom == 0) {
                scores[i] = PRECISION / 2; // 0,5
            } else {
                scores[i] = (dMinus * PRECISION) / denom;
            }
        }
        return scores;
    }

    // ================================================================
    // SIGMOID (dari Hugo, tidak diubah)
    // ================================================================

    /**
     * BUKAN fungsi logistik, walau komentar asli Hugo menyebut "cubic" dan "piecewise linear".
     * Dengan x = k * (S - x0):
     *   x > 10 -> 1, x < -10 -> 0,
     *   x >= 0 -> 0,5 + 0,5 * x / (x + 1),
     *   x < 0  -> 0,5 - 0,5 * |x| / (|x| + 1).
     * Nilai pada S = 0 dan S = 1 adalah 0,0833 dan 0,9167, bukan 0,0067 dan 0,9933 seperti logistik.
     * Selisihnya dengan pratinjau off-chain Hugo dicatat di docs/arsitektur.md bagian 14.
     */
    function _sigmoid(uint256 score) internal view returns (uint256) {
        int256 diff = int256(score) - int256(sigmoidX0);
        int256 x = (diff * int256(sigmoidK)) / int256(PRECISION);

        if (x > 10 * int256(PRECISION)) return PRECISION;
        if (x < -10 * int256(PRECISION)) return 0;

        if (x >= 0) {
            uint256 ux = uint256(x);
            return PRECISION / 2 + (PRECISION / 2 * ux) / (ux + PRECISION);
        } else {
            uint256 ux = uint256(-x);
            return PRECISION / 2 - (PRECISION / 2 * ux) / (ux + PRECISION);
        }
    }

    /// Akar kuadrat bilangan bulat (metode Babilonia).
    function _sqrt(uint256 x) internal pure returns (uint256) {
        if (x == 0) return 0;
        uint256 z = (x + 1) / 2;
        uint256 y = x;
        while (z < y) {
            y = z;
            z = (x / z + z) / 2;
        }
        return y;
    }

    // ================================================================
    // ADMIN
    // ================================================================

    /// Di Hugo tanpa validasi. Di sini k > 0 dan x0 <= 1.
    function setSigmoidParams(uint256 k, uint256 x0) external onlyAdmin {
        if (k == 0 || x0 > PRECISION) revert InvalidSigmoidParams();
        sigmoidK = k;
        sigmoidX0 = x0;
        emit SigmoidParamsUpdated(k, x0);
    }

    function setOperator(address newOperator) external onlyAdmin {
        if (newOperator == address(0)) revert InvalidAddress();
        emit OperatorUpdated(operator, newOperator);
        operator = newOperator;
    }
}
