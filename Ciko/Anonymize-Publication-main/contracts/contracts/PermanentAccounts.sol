// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IPermanentAccounts.sol";

contract PermanentAccounts is IPermanentAccounts {
    address public immutable override admin;

    mapping(address => PermanentAccount) private _accounts;
    mapping(bytes32 => bool) private _usedCommitments;

    constructor() {
        admin = msg.sender;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    function register(bytes32 identityCommitment) external override {
        _register(msg.sender, identityCommitment);
    }

    function adminRegister(
        address account,
        bytes32 identityCommitment
    ) external override onlyAdmin {
        _register(account, identityCommitment);
    }

    function adminBatchRegister(
        address[] calldata accounts,
        bytes32[] calldata identityCommitments
    ) external override onlyAdmin {
        uint256 length = accounts.length;
        if (length != identityCommitments.length) revert ArrayLengthMismatch();
        for (uint256 i; i < length; ) {
            _register(accounts[i], identityCommitments[i]);
            unchecked {
                ++i;
            }
        }
    }

    function getMyAccount() external view override returns (PermanentAccount memory) {
        return _getOrRevert(msg.sender);
    }

    function getAccount(address account) external view override returns (PermanentAccount memory) {
        return _getOrRevert(account);
    }

    function isRegistered(address account) external view override returns (bool) {
        return _accounts[account].exists;
    }

    function getIdentityCommitment(address account) external view override returns (bytes32) {
        return _getOrRevert(account).identityCommitment;
    }

    function isCommitmentUsed(bytes32 identityCommitment) external view override returns (bool) {
        return _usedCommitments[identityCommitment];
    }

    function _getOrRevert(address account) internal view returns (PermanentAccount memory data) {
        data = _accounts[account];
        if (!data.exists) revert AccountNotRegistered();
    }

    function _register(address account, bytes32 identityCommitment) internal {
        if (account == address(0)) revert InvalidAccount();
        if (identityCommitment == bytes32(0)) revert InvalidCommitment();
        if (_accounts[account].exists) revert AccountAlreadyRegistered();
        if (_usedCommitments[identityCommitment]) revert CommitmentAlreadyUsed();

        uint64 ts = uint64(block.timestamp);
        _accounts[account] = PermanentAccount({
            exists: true,
            registeredAt: ts,
            identityCommitment: identityCommitment
        });
        _usedCommitments[identityCommitment] = true;

        emit PermanentAccountRegistered(account, identityCommitment, ts);
    }
}
