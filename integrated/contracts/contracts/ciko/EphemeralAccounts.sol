// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IEphemeralAccounts.sol";

/**
 * PERUBAHAN DARI KODE CIKO (docs/arsitektur.md bagian 8.2 dan 9):
 *  - Tidak lagi mengenal `PermanentAccounts`. Kode asal memeriksa commitment identitas
 *    permanen di sini dan mencatatnya di event, sehingga pseudonim bisa ditautkan ke
 *    akun permanen dari data publik. Pemeriksaan keanggotaan kini dilakukan oleh bukti
 *    ZK di `ActionGateway`.
 *  - Field `identityCommitment` menjadi `sessionCommitment`: nilai per sesi/peran/slot
 *    yang tidak bisa dihubungkan ke commitment permanen tanpa secret.
 *  - Keunikan commitment global dihapus (satu orang boleh punya pseudonim di banyak
 *    sesi). Keunikan per (sesi, commitment) dipertahankan; keunikan per orang dijaga
 *    nullifier di gateway.
 */
contract EphemeralAccounts is IEphemeralAccounts {
    address private _admin;

    mapping(address => EphemeralAccount) private _accounts;
    mapping(address => bool) private _sessionManagers;
    mapping(bytes32 => bool) private _usedCommitmentsInSession;
    mapping(bytes32 => bool) private _usedPseudonymsInSession;

    modifier onlyAdmin() {
        if (msg.sender != _admin) revert OnlyAdmin();
        _;
    }

    modifier onlySessionManager() {
        if (!_sessionManagers[msg.sender]) revert OnlySessionManager();
        _;
    }

    constructor() {
        _admin = msg.sender;
    }

    function setSessionManager(address manager, bool authorized) external override onlyAdmin {
        _sessionManagers[manager] = authorized;
    }

    function revokeEphemeral(address pseudonym) external override onlyAdmin {
        EphemeralAccount storage acc = _accounts[pseudonym];
        if (!acc.exists) revert AccountNotFound();
        acc.revoked = true;
        emit EphemeralAccountRevoked(pseudonym, acc.sessionId, uint64(block.timestamp));
    }

    function createEphemeral(
        address pseudonym,
        bytes32 sessionId,
        Role role,
        bytes32 sessionCommitment
    ) external override onlySessionManager {
        if (pseudonym == address(0)) revert InvalidPseudonym();
        if (sessionId == bytes32(0)) revert InvalidSession();
        if (sessionCommitment == bytes32(0)) revert InvalidCommitment();
        if (_accounts[pseudonym].exists) revert PseudonymAlreadyExists();

        bytes32 commitKey = keccak256(abi.encodePacked(sessionId, sessionCommitment));
        bytes32 pseudoKey = keccak256(abi.encodePacked(sessionId, pseudonym));

        if (_usedCommitmentsInSession[commitKey]) revert CommitmentAlreadyUsedInSession();
        if (_usedPseudonymsInSession[pseudoKey]) revert PseudonymAlreadyExists();

        _accounts[pseudonym] = EphemeralAccount({
            exists: true,
            role: role,
            sessionId: sessionId,
            sessionCommitment: sessionCommitment,
            createdAt: uint64(block.timestamp),
            revoked: false
        });

        _usedCommitmentsInSession[commitKey] = true;
        _usedPseudonymsInSession[pseudoKey] = true;

        emit EphemeralAccountCreated(
            pseudonym,
            sessionId,
            role,
            sessionCommitment,
            uint64(block.timestamp)
        );
    }

    function admin() external view override returns (address) {
        return _admin;
    }
    function isSessionManager(address addr) external view override returns (bool) {
        return _sessionManagers[addr];
    }

    function isActive(address pseudonym) external view override returns (bool) {
        EphemeralAccount storage acc = _accounts[pseudonym];
        return acc.exists && !acc.revoked;
    }

    function exists(address pseudonym) external view override returns (bool) {
        return _accounts[pseudonym].exists;
    }

    function getAccount(
        address pseudonym
    ) external view override returns (EphemeralAccount memory) {
        EphemeralAccount memory acc = _accounts[pseudonym];
        if (!acc.exists) revert AccountNotFound();
        return acc;
    }

    function isCommitmentUsedInSession(
        bytes32 sessionId,
        bytes32 sessionCommitment
    ) external view override returns (bool) {
        return
            _usedCommitmentsInSession[keccak256(abi.encodePacked(sessionId, sessionCommitment))];
    }

    function isPseudonymUsedInSession(
        bytes32 sessionId,
        address pseudonym
    ) external view override returns (bool) {
        return _usedPseudonymsInSession[keccak256(abi.encodePacked(sessionId, pseudonym))];
    }

}
