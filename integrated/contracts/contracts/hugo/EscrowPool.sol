// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "../ciko/interfaces/IPublicationSessions.sol";
import "../ciko/interfaces/IReviewerSelections.sol";
import "../ciko/interfaces/IReviewDecisions.sol";
import "../zk/IZkVerifier.sol";
import "../zk/IVerifierSource.sol";
import "./interfaces/IEscrowPool.sol";

/**
 * EscrowPool: APC dibayar di muka oleh penulis dan ditahan sampai sesi selesai
 * (docs/arsitektur.md bagian 6.1). Dipecah dari `createBatch` Hugo, yang memuat penulis,
 * penelaah, dan jurnal dalam satu transaksi (IncentiveEngine.sol:72-84) sehingga mustahil
 * dipakai bersama pseudonim.
 *
 * Alur dana:
 *   deposit(noteCommitment)         dompet penulis, APC tetap, note belum terikat
 *   bindNote(sesi, nullifier, bukti) relayer; note tidak muncul di transaksi ini
 *   refund(sesi, alamatBaru, ...)    ditolak sebelum ada keputusan penelaah, atau macet melewati timeout
 *   creditRewards(...)               IncentiveEngine, saat ada keputusan dan status final
 *   claimReward(sesi, pseudonim, alamatBaru, tanda tangan EIP-712)
 *
 * Note adalah pool nominal tetap (`apcAmount`): semua setoran sama besar, sehingga ikatan
 * ke sesi tidak bisa dikorelasikan lewat jumlah. Pembuktian kepemilikan note ([SIMULASI]):
 * attestor `zk-sim` memeriksa rahasia note, kontrak memeriksa tanda tangan attestor.
 * Kontrak sendiri hanya menjaga solvabilitas (ikatan tidak boleh melebihi setoran), nullifier
 * tidak dipakai ulang, dan satu sesi hanya punya satu escrow.
 *
 * Aturan dana (tabel arsitektur 6.1) sepenuhnya dihitung dari keadaan kontrak Ciko:
 *   refundable:    belum ada keputusan, dan (Rejected tanpa batch penelaah, atau macet > idleTimeout)
 *   distributable: ada keputusan, dan (Accepted/Published/Rejected, atau macet > idleTimeout)
 * "Macet" = `updatedAt` sesi lebih lama dari `idleTimeout`. Keduanya saling lepas.
 */
contract EscrowPool is IEscrowPool, EIP712, ReentrancyGuard {
    enum EscrowState {
        None,
        Bound, // terikat ke sesi, belum diputuskan
        Credited, // sudah dikreditkan ke penelaah
        Refunded
    }

    struct Escrow {
        EscrowState state;
        uint256 amount;
        bytes32 bindNullifier;
        uint64 boundAt;
        uint256 unclaimed;
    }

    bytes32 public constant CLAIM_REWARD_TYPEHASH =
        keccak256("ClaimReward(bytes32 sessionId,address pseudonym,address recipient)");

    address public admin;
    /// IncentiveEngine. Diatur sekali oleh admin.
    address public engine;

    IPublicationSessions public immutable publicationSessions;
    IReviewerSelections public immutable reviewerSelections;
    IReviewDecisions public immutable reviewDecisions;
    IVerifierSource public immutable verifierSource;
    /// APC per sesi (nominal tetap).
    uint256 public immutable apcAmount;
    /// Lama tanpa kemajuan sesi sebelum dianggap macet (detik).
    uint64 public immutable idleTimeout;

    /// Setoran note: commitment => sudah disetor.
    mapping(bytes32 => bool) public noteDeposited;
    /// Setoran yang belum diikat ke sesi.
    uint256 public unboundNotes;
    uint256 public depositCount;
    /// Nullifier ikat dan refund berbagi satu ruang nama.
    mapping(bytes32 => bool) public nullifierUsed;

    mapping(bytes32 => Escrow) public escrows;
    mapping(bytes32 => mapping(address => uint256)) public rewardCredit;

    event NoteDeposited(bytes32 indexed noteCommitment, uint256 depositIndex);
    /// Tanpa note dan tanpa penyetor.
    event NoteBound(bytes32 indexed sessionId, bytes32 nullifier);
    event Refunded(bytes32 indexed sessionId, address indexed recipient, uint256 amount);
    event RewardsCredited(bytes32 indexed sessionId, uint256 amount, uint256 recipients);
    event RewardClaimed(bytes32 indexed sessionId, address indexed pseudonym, address indexed recipient, uint256 amount);
    event EngineSet(address indexed engine);

    error OnlyAdmin();
    error OnlyEngine();
    error EngineAlreadySet();
    error InvalidAddress();
    error WrongAmount();
    error NoteAlreadyDeposited();
    error SessionNotFound();
    error SessionNotBindable();
    error AlreadyBound();
    error NoUnboundNote();
    error NullifierAlreadyUsed();
    error InvalidProof();
    error NotRefundable();
    error NotDistributable();
    error InvalidCredit();
    error NothingToClaim();
    error InvalidSignature();
    error TransferFailed();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    constructor(
        address publicationSessions_,
        address reviewerSelections_,
        address reviewDecisions_,
        address verifierSource_,
        uint256 apcAmount_,
        uint64 idleTimeout_
    ) EIP712("DecPubEscrowPool", "1") {
        if (
            publicationSessions_ == address(0) ||
            reviewerSelections_ == address(0) ||
            reviewDecisions_ == address(0) ||
            verifierSource_ == address(0) ||
            apcAmount_ == 0 ||
            idleTimeout_ == 0
        ) revert InvalidAddress();
        admin = msg.sender;
        publicationSessions = IPublicationSessions(publicationSessions_);
        reviewerSelections = IReviewerSelections(reviewerSelections_);
        reviewDecisions = IReviewDecisions(reviewDecisions_);
        verifierSource = IVerifierSource(verifierSource_);
        apcAmount = apcAmount_;
        idleTimeout = idleTimeout_;
    }

    /// Memasang IncentiveEngine. Hanya sekali.
    function setEngine(address engine_) external onlyAdmin {
        if (engine != address(0)) revert EngineAlreadySet();
        if (engine_ == address(0)) revert InvalidAddress();
        engine = engine_;
        emit EngineSet(engine_);
    }

    // ---------------------------------------------------------------- setoran

    /// P01: penulis membeli satu note APC dari dompet mana pun. `noteCommitment` = hash rahasia note.
    function deposit(bytes32 noteCommitment) external payable {
        if (msg.value != apcAmount) revert WrongAmount();
        if (noteCommitment == bytes32(0) || noteDeposited[noteCommitment]) revert NoteAlreadyDeposited();
        noteDeposited[noteCommitment] = true;
        unboundNotes++;
        emit NoteDeposited(noteCommitment, depositCount++);
    }

    /**
     * P02: mengikat satu note ke sesi. Siapa pun boleh mengirim (relayer atau penulis), bukti
     * mengikat sesi dan nullifier sehingga pengirim tidak bisa mengubah apa pun.
     * Sinyal publik bukti NoteBind: [sessionId, nullifier].
     */
    function bindNote(bytes32 sessionId, bytes32 nullifier, bytes calldata proof) external {
        if (!publicationSessions.exists(sessionId)) revert SessionNotFound();
        // Hanya sesi yang belum sampai keputusan akhir (Accepted=10, Rejected=11, Published=12).
        if (uint8(publicationSessions.getSession(sessionId).status) >= uint8(IPublicationSessions.PublicationStatus.Accepted)) {
            revert SessionNotBindable();
        }
        if (escrows[sessionId].state != EscrowState.None) revert AlreadyBound();
        if (nullifierUsed[nullifier]) revert NullifierAlreadyUsed();
        if (unboundNotes == 0) revert NoUnboundNote();

        bytes32[] memory signals = new bytes32[](2);
        signals[0] = sessionId;
        signals[1] = nullifier;
        _verify(IZkVerifier.Kind.NoteBind, signals, proof);

        nullifierUsed[nullifier] = true;
        unboundNotes--;
        escrows[sessionId] = Escrow({
            state: EscrowState.Bound,
            amount: apcAmount,
            bindNullifier: nullifier,
            boundAt: uint64(block.timestamp),
            unclaimed: 0
        });
        emit NoteBound(sessionId, nullifier);
    }

    // ----------------------------------------------------------------- refund

    /**
     * Refund penuh ke alamat baru, hanya bila `refundable`. Sinyal publik bukti NoteRefund:
     * [sessionId, recipient, nullifier]. Penerima terikat pada bukti, jadi relayer tidak bisa
     * mengalihkan dana. Alamat penerima sebaiknya alamat yang belum pernah dipakai.
     */
    function refund(
        bytes32 sessionId,
        address recipient,
        bytes32 nullifier,
        bytes calldata proof
    ) external nonReentrant {
        if (recipient == address(0)) revert InvalidAddress();
        if (!refundable(sessionId)) revert NotRefundable();
        if (nullifierUsed[nullifier]) revert NullifierAlreadyUsed();

        bytes32[] memory signals = new bytes32[](3);
        signals[0] = sessionId;
        signals[1] = bytes32(uint256(uint160(recipient)));
        signals[2] = nullifier;
        _verify(IZkVerifier.Kind.NoteRefund, signals, proof);

        nullifierUsed[nullifier] = true;
        Escrow storage e = escrows[sessionId];
        e.state = EscrowState.Refunded;
        uint256 amount = e.amount;
        emit Refunded(sessionId, recipient, amount);
        _send(recipient, amount);
    }

    // ----------------------------------------------------------------- imbalan

    /// Dipanggil IncentiveEngine. Jumlah harus tepat sama dengan escrow, supaya tak ada sisa tertahan.
    function creditRewards(
        bytes32 sessionId,
        address[] calldata pseudonyms,
        uint256[] calldata amounts
    ) external override {
        if (msg.sender != engine) revert OnlyEngine();
        if (!distributable(sessionId)) revert NotDistributable();
        if (pseudonyms.length == 0 || pseudonyms.length != amounts.length) revert InvalidCredit();

        Escrow storage e = escrows[sessionId];
        uint256 sum;
        for (uint256 i = 0; i < pseudonyms.length; i++) {
            if (pseudonyms[i] == address(0)) revert InvalidCredit();
            sum += amounts[i];
            rewardCredit[sessionId][pseudonyms[i]] += amounts[i];
        }
        if (sum != e.amount) revert InvalidCredit();
        e.state = EscrowState.Credited;
        e.unclaimed = sum;
        emit RewardsCredited(sessionId, sum, pseudonyms.length);
    }

    /**
     * P08: klaim imbalan ke alamat baru. Pseudonim penelaah menandatangani (EIP-712)
     * `ClaimReward(sessionId, pseudonym, recipient)`; siapa pun boleh mengirim (relayer
     * membayar gas). Imbalan dinolkan sebelum dikirim, jadi tidak bisa diklaim dua kali.
     */
    function claimReward(
        bytes32 sessionId,
        address pseudonym,
        address recipient,
        bytes calldata signature
    ) external nonReentrant {
        if (recipient == address(0)) revert InvalidAddress();
        uint256 amount = rewardCredit[sessionId][pseudonym];
        if (amount == 0) revert NothingToClaim();

        bytes32 digest = _hashTypedDataV4(
            keccak256(abi.encode(CLAIM_REWARD_TYPEHASH, sessionId, pseudonym, recipient))
        );
        (address signer, ECDSA.RecoverError err, ) = ECDSA.tryRecover(digest, signature);
        if (err != ECDSA.RecoverError.NoError || signer != pseudonym) revert InvalidSignature();

        rewardCredit[sessionId][pseudonym] = 0;
        escrows[sessionId].unclaimed -= amount;
        emit RewardClaimed(sessionId, pseudonym, recipient, amount);
        _send(recipient, amount);
    }

    // ------------------------------------------------------------------ views

    /// Ada keputusan penelaah pada salah satu batch sesi.
    function hasDecision(bytes32 sessionId) public view returns (bool) {
        uint32 latest = reviewerSelections.getLatestBatch(sessionId);
        for (uint32 b = 1; b <= latest; b++) {
            if (reviewDecisions.hasDecision(sessionId, b)) return true;
        }
        return false;
    }

    /// Sesi macet: `updatedAt` lebih lama dari `idleTimeout`.
    function isIdle(bytes32 sessionId) public view returns (bool) {
        return block.timestamp > uint256(publicationSessions.getSession(sessionId).updatedAt) + idleTimeout;
    }

    /// Dana boleh dikembalikan ke penulis. Tidak pernah benar bersamaan dengan `distributable`.
    function refundable(bytes32 sessionId) public view returns (bool) {
        if (escrows[sessionId].state != EscrowState.Bound) return false;
        if (hasDecision(sessionId)) return false;
        IPublicationSessions.PublicationStatus status = publicationSessions.getSession(sessionId).status;
        if (
            status == IPublicationSessions.PublicationStatus.Rejected &&
            reviewerSelections.getLatestBatch(sessionId) == 0
        ) return true;
        return isIdle(sessionId);
    }

    /// Dana boleh dibagikan ke penelaah yang reveal.
    function distributable(bytes32 sessionId) public view override returns (bool) {
        if (escrows[sessionId].state != EscrowState.Bound) return false;
        if (!hasDecision(sessionId)) return false;
        IPublicationSessions.PublicationStatus status = publicationSessions.getSession(sessionId).status;
        if (
            status == IPublicationSessions.PublicationStatus.Accepted ||
            status == IPublicationSessions.PublicationStatus.Published ||
            status == IPublicationSessions.PublicationStatus.Rejected
        ) return true;
        return isIdle(sessionId);
    }

    function escrowAmount(bytes32 sessionId) external view override returns (uint256) {
        return escrows[sessionId].amount;
    }

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // --------------------------------------------------------------- internal

    function _verify(IZkVerifier.Kind kind, bytes32[] memory signals, bytes calldata proof) internal view {
        if (!IZkVerifier(verifierSource.verifier()).verify(uint8(kind), signals, proof)) revert InvalidProof();
    }

    function _send(address to, uint256 amount) internal {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
