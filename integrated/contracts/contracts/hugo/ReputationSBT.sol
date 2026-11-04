// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "../zk/IZkVerifier.sol";
import "../zk/IVerifierSource.sol";
import "./interfaces/IReputationSBT.sol";

/**
 * ReputationSBT: reputasi non-transferable dengan decay. Dari `Hugo/.../ReputationSBT.sol`,
 * dengan tiga perubahan (docs/arsitektur.md bagian 6.4 dan 9):
 *
 *  1. Kunci `bytes32 reputationId` (hash dari secret), bukan `address`. Pseudonim sesi tidak
 *     pernah menyentuh kontrak ini, sehingga transaksi mint tidak menaut reputasi ke naskah.
 *  2. Mint lewat klaim bertanda bukti ZK [SIMULASI] (`ReputationClaim`), dengan nullifier dan
 *     jumlah berkelipatan `claimStep` supaya nilainya bukan sidik jari. Klaim digabung relayer
 *     dalam satu transaksi. `IncentiveEngine` hanya menambah `unclaimedPool` agregat; kontrak
 *     menjaga total klaim tidak melebihi total yang dikreditkan.
 *  3. Decay tidak bisa dihindari. Di Hugo `triggerDecay` dan `mint` mereset penanda waktu ke
 *     sekarang sementara hari dibulatkan ke bawah, sehingga memanggilnya tiap kurang dari 24 jam
 *     menahan decay selamanya. Di sini penanda hanya maju sebesar hari penuh yang sudah
 *     dipotong, sisa jam tidak hilang.
 *
 * Sifat soulbound: tidak ada fungsi transfer. Bukan ERC-20/721/5192 (sama seperti Hugo).
 */
contract ReputationSBT is IReputationSBT {
    uint256 public constant PRECISION = 1e18;

    struct Claim {
        bytes32 reputationId;
        uint256 amount;
        bytes32 nullifier;
        bytes proof;
    }

    address public admin;
    /// IncentiveEngine. Diatur sekali oleh admin.
    address public engine;
    IVerifierSource public immutable verifierSource;
    /// Kelipatan jumlah klaim (bawaan 0,25 = 0.25e18).
    uint256 public immutable claimStep;
    /// Skala 1e18, per hari. Bawaan Hugo 0,02.
    uint256 public decayRatePerDay;
    /// Reputasi yang sudah dikreditkan engine tetapi belum diklaim.
    uint256 public unclaimedPool;

    mapping(bytes32 => uint256) private _balances;
    /// Batas waktu decay terakhir yang sudah diterapkan ke saldo. Selalu maju kelipatan 1 hari.
    mapping(bytes32 => uint64) private _checkpoint;
    mapping(bytes32 => bool) public nullifierUsed;

    event ReputationAccrued(uint256 amount, uint256 unclaimedPool);
    /// Tanpa pseudonim dan tanpa sesi, sengaja.
    event ReputationMinted(bytes32 indexed reputationId, uint256 amount);
    event ReputationDecayed(bytes32 indexed reputationId, uint256 before, uint256 after_);
    event EngineSet(address indexed engine);
    event DecayRateUpdated(uint256 previousRate, uint256 newRate);

    error OnlyAdmin();
    error OnlyEngine();
    error EngineAlreadySet();
    error InvalidAddress();
    error InvalidRate();
    error InvalidAmount();
    error NullifierAlreadyUsed();
    error InvalidProof();
    error ExceedsUnclaimed();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    constructor(address verifierSource_, uint256 decayRatePerDay_, uint256 claimStep_) {
        if (verifierSource_ == address(0) || claimStep_ == 0) revert InvalidAddress();
        if (decayRatePerDay_ >= PRECISION) revert InvalidRate();
        admin = msg.sender;
        verifierSource = IVerifierSource(verifierSource_);
        decayRatePerDay = decayRatePerDay_;
        claimStep = claimStep_;
    }

    // ------------------------------------------------------------------ admin

    /// Memasang IncentiveEngine. Hanya sekali.
    function setEngine(address engine_) external onlyAdmin {
        if (engine != address(0)) revert EngineAlreadySet();
        if (engine_ == address(0)) revert InvalidAddress();
        engine = engine_;
        emit EngineSet(engine_);
    }

    /// Mengubah laju decay (di Hugo tak terjangkau setelah kepemilikan pindah ke Engine).
    /// Berlaku untuk hari yang belum dipotong, jadi mengubahnya berlaku surut atas decay yang tertunda.
    function setDecayRate(uint256 newRate) external onlyAdmin {
        if (newRate >= PRECISION) revert InvalidRate();
        emit DecayRateUpdated(decayRatePerDay, newRate);
        decayRatePerDay = newRate;
    }

    // ----------------------------------------------------------------- kredit

    /// Dipanggil IncentiveEngine saat distribusi: menambah jumlah yang boleh diklaim.
    function accrue(uint256 amount) external override {
        if (msg.sender != engine) revert OnlyEngine();
        unclaimedPool += amount;
        emit ReputationAccrued(amount, unclaimedPool);
    }

    /**
     * Mint reputasi atas klaim bertanda bukti. Boleh dikirim siapa saja, biasanya relayer yang
     * menggabungkan banyak klaim per epoch. Bukti mengikat reputationId, jumlah, dan nullifier.
     */
    function claimReputation(Claim[] calldata claims) external {
        IZkVerifier verifier = IZkVerifier(verifierSource.verifier());
        for (uint256 i = 0; i < claims.length; i++) {
            Claim calldata c = claims[i];
            if (c.amount == 0 || c.amount % claimStep != 0) revert InvalidAmount();
            if (nullifierUsed[c.nullifier]) revert NullifierAlreadyUsed();
            if (c.amount > unclaimedPool) revert ExceedsUnclaimed();

            bytes32[] memory signals = new bytes32[](3);
            signals[0] = c.reputationId;
            signals[1] = bytes32(c.amount);
            signals[2] = c.nullifier;
            if (!verifier.verify(uint8(IZkVerifier.Kind.ReputationClaim), signals, c.proof)) {
                revert InvalidProof();
            }

            nullifierUsed[c.nullifier] = true;
            unclaimedPool -= c.amount;
            _credit(c.reputationId, c.amount);
            emit ReputationMinted(c.reputationId, c.amount);
        }
    }

    /// Menerapkan decay yang tertunda. Siapa pun boleh memanggil; tidak bisa menunda decay.
    function triggerDecay(bytes32 reputationId) external {
        uint256 before = _balances[reputationId];
        _settle(reputationId);
        emit ReputationDecayed(reputationId, before, _balances[reputationId]);
    }

    // ------------------------------------------------------------------ views

    /// Saldo mentah (decay yang tertunda belum diterapkan).
    function balanceOf(bytes32 reputationId) external view returns (uint256) {
        return _balances[reputationId];
    }

    /// Saldo setelah decay: sumber q4.
    function effectiveBalance(bytes32 reputationId) external view returns (uint256) {
        (uint256 bal, ) = _decayedView(reputationId);
        return bal;
    }

    /// Batas waktu decay yang terakhir diterapkan (0 bila belum pernah punya saldo).
    function decayCheckpoint(bytes32 reputationId) external view returns (uint64) {
        return _checkpoint[reputationId];
    }

    // --------------------------------------------------------------- internal

    function _credit(bytes32 id, uint256 amount) internal {
        _settle(id);
        // Saldo kosong (belum pernah punya, atau sudah meluruh habis): jam decay mulai dari sekarang.
        if (_balances[id] == 0) _checkpoint[id] = uint64(block.timestamp);
        _balances[id] += amount;
    }

    function _settle(bytes32 id) internal {
        (uint256 bal, uint64 cp) = _decayedView(id);
        _balances[id] = bal;
        _checkpoint[id] = cp;
    }

    /// Saldo dan penanda waktu setelah semua hari penuh dipotong. Sisa jam tetap tercatat.
    function _decayedView(bytes32 id) internal view returns (uint256 bal, uint64 cp) {
        bal = _balances[id];
        cp = _checkpoint[id];
        if (bal == 0 || cp == 0) return (bal, cp);
        uint256 elapsedDays = (block.timestamp - cp) / 1 days;
        if (elapsedDays == 0) return (bal, cp);

        // (1 - lambda)^hari, eksponen dengan kuadrat berulang.
        uint256 factor = PRECISION;
        uint256 base = PRECISION - decayRatePerDay;
        uint256 exp = elapsedDays;
        while (exp > 0) {
            if (exp % 2 == 1) factor = (factor * base) / PRECISION;
            base = (base * base) / PRECISION;
            exp /= 2;
        }
        bal = (bal * factor) / PRECISION;
        cp = cp + uint64(elapsedDays * 1 days);
    }
}
