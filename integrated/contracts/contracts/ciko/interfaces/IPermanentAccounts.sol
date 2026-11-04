// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPermanentAccounts {
    struct PermanentAccount {
        bool exists;
        uint64 registeredAt;
        bytes32 identityCommitment;
    }

    event PermanentAccountRegistered(
        address indexed account,
        bytes32 indexed identityCommitment,
        uint64 registeredAt
    );

    error OnlyAdmin();
    error InvalidAccount();
    error InvalidCommitment();
    error ArrayLengthMismatch();
    error AccountAlreadyRegistered();
    error CommitmentAlreadyUsed();
    error AccountNotRegistered();

    function admin() external view returns (address);

    function register(bytes32 identityCommitment) external;

    function adminRegister(address account, bytes32 identityCommitment) external;

    function adminBatchRegister(
        address[] calldata accounts,
        bytes32[] calldata identityCommitments
    ) external;

    function getMyAccount() external view returns (PermanentAccount memory);

    function getAccount(address account) external view returns (PermanentAccount memory);

    function isRegistered(address account) external view returns (bool);

    function getIdentityCommitment(address account) external view returns (bytes32);

    function isCommitmentUsed(bytes32 identityCommitment) external view returns (bool);
}
