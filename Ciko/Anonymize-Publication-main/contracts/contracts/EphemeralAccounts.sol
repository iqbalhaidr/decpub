// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IEphemeralAccounts.sol";
import "./interfaces/IPermanentAccounts.sol";

contract EphemeralAccounts is IEphemeralAccounts {
    address private _admin;
    IPermanentAccounts private immutable _permanentAccounts;

    mapping(address => EphemeralAccount) private _accounts;
    mapping(address => bool) private _sessionManagers;
    mapping(bytes32 => bool) private _usedCommitmentsInSession;
    mapping(bytes32 => bool) private _usedPseudonymsInSession;
    mapping(bytes32 => bool) private _usedCommitmentsGlobal;

    modifier onlyAdmin() {
        if (msg.sender != _admin) revert OnlyAdmin();
        _;
    }

    modifier onlySessionManager() {
        if (!_sessionManagers[msg.sender]) revert OnlySessionManager();
        _;
    }

    constructor(address permanentAccountsAddr) {
        _admin = msg.sender;
        _permanentAccounts = IPermanentAccounts(permanentAccountsAddr);
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
        bytes32 identityCommitment
    ) external override onlySessionManager {
        if (pseudonym == address(0)) revert InvalidPseudonym();
        if (sessionId == bytes32(0)) revert InvalidSession();
        if (identityCommitment == bytes32(0)) revert InvalidCommitment();
        if (_accounts[pseudonym].exists) revert PseudonymAlreadyExists();
        if (_usedCommitmentsGlobal[identityCommitment]) revert CommitmentAlreadyUsedGlobally();
        if (!_permanentAccounts.isCommitmentUsed(identityCommitment))
            revert PermanentAccountNotRegistered();

        bytes32 commitKey = keccak256(abi.encodePacked(sessionId, identityCommitment));
        bytes32 pseudoKey = keccak256(abi.encodePacked(sessionId, pseudonym));

        if (_usedCommitmentsInSession[commitKey]) revert CommitmentAlreadyUsedInSession();
        if (_usedPseudonymsInSession[pseudoKey]) revert PseudonymAlreadyExists();

        _accounts[pseudonym] = EphemeralAccount({
            exists: true,
            role: role,
            sessionId: sessionId,
            identityCommitment: identityCommitment,
            createdAt: uint64(block.timestamp),
            revoked: false
        });

        _usedCommitmentsGlobal[identityCommitment] = true;
        _usedCommitmentsInSession[commitKey] = true;
        _usedPseudonymsInSession[pseudoKey] = true;

        emit EphemeralAccountCreated(
            pseudonym,
            sessionId,
            role,
            identityCommitment,
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
        bytes32 identityCommitment
    ) external view override returns (bool) {
        return
            _usedCommitmentsInSession[keccak256(abi.encodePacked(sessionId, identityCommitment))];
    }

    function isPseudonymUsedInSession(
        bytes32 sessionId,
        address pseudonym
    ) external view override returns (bool) {
        return _usedPseudonymsInSession[keccak256(abi.encodePacked(sessionId, pseudonym))];
    }

    function isCommitmentUsedGlobally(
        bytes32 identityCommitment
    ) external view override returns (bool) {
        return _usedCommitmentsGlobal[identityCommitment];
    }
}
