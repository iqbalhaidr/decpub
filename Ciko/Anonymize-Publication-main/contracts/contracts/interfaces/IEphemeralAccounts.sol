// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IEphemeralAccounts {
    enum Role {
        Author,
        Reviewer,
        Editor
    }

    struct EphemeralAccount {
        bool exists;
        Role role;
        bytes32 sessionId;
        bytes32 identityCommitment;
        uint64 createdAt;
        bool revoked;
    }

    event EphemeralAccountCreated(
        address indexed pseudonym,
        bytes32 indexed sessionId,
        Role indexed role,
        bytes32 identityCommitment,
        uint64 createdAt
    );

    event EphemeralAccountRevoked(
        address indexed pseudonym,
        bytes32 indexed sessionId,
        uint64 revokedAt
    );

    error OnlyAdmin();
    error OnlySessionManager();
    error PseudonymAlreadyExists();
    error CommitmentAlreadyUsedInSession();
    error CommitmentAlreadyUsedGlobally();
    error InvalidCommitment();
    error InvalidPseudonym();
    error InvalidSession();
    error AccountNotFound();
    error AccountRevoked();
    error PermanentAccountNotRegistered();

    function createEphemeral(
        address pseudonym,
        bytes32 sessionId,
        Role role,
        bytes32 identityCommitment
    ) external;

    function revokeEphemeral(address pseudonym) external;

    function setSessionManager(address manager, bool authorized) external;

    function admin() external view returns (address);

    function isSessionManager(address addr) external view returns (bool);

    function isActive(address pseudonym) external view returns (bool);

    function exists(address pseudonym) external view returns (bool);

    function getAccount(address pseudonym) external view returns (EphemeralAccount memory);

    function isCommitmentUsedInSession(
        bytes32 sessionId,
        bytes32 identityCommitment
    ) external view returns (bool);

    function isPseudonymUsedInSession(
        bytes32 sessionId,
        address pseudonym
    ) external view returns (bool);

    function isCommitmentUsedGlobally(bytes32 identityCommitment) external view returns (bool);
}
