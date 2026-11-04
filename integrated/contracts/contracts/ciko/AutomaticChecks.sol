// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IAutomaticChecks.sol";
import "./interfaces/IPublicationSessions.sol";

contract AutomaticChecks is IAutomaticChecks {
    address private _admin;
    IPublicationSessions private immutable _publicationSessions;

    mapping(address => bool) private _sessionManagers;
    mapping(bytes32 => uint32) private _latestBatch;
    mapping(bytes32 => mapping(uint32 => AutomaticCheckRecord)) private _records;

    modifier onlyAdmin() {
        if (msg.sender != _admin) revert OnlyAdmin();
        _;
    }

    modifier onlySessionManager() {
        if (!_sessionManagers[msg.sender]) revert OnlySessionManager();
        _;
    }

    modifier sessionMustExist(bytes32 sessionId) {
        if (sessionId == bytes32(0)) revert InvalidSessionId();
        if (!_publicationSessions.exists(sessionId)) revert SessionNotFound();
        _;
    }

    constructor(address publicationSessionsAddr) {
        _admin = msg.sender;
        _publicationSessions = IPublicationSessions(publicationSessionsAddr);
    }

    function setSessionManager(address manager, bool authorized) external override onlyAdmin {
        _sessionManagers[manager] = authorized;
        emit SessionManagerUpdated(manager, authorized, uint64(block.timestamp));
    }

    function recordAutomaticCheck(
        bytes32 sessionId,
        bytes32 reportHash,
        bytes32 flagsHash,
        string calldata reportURI,
        AutomaticCheckResult result
    ) external override onlySessionManager sessionMustExist(sessionId) returns (uint32 batch) {
        if (reportHash == bytes32(0)) revert InvalidHash();
        if (flagsHash == bytes32(0)) revert InvalidHash();
        if (result == AutomaticCheckResult.None) revert InvalidResult();

        IPublicationSessions.PublicationStatus status = _publicationSessions
            .getSession(sessionId)
            .status;
        if (
            status != IPublicationSessions.PublicationStatus.Submitted &&
            status != IPublicationSessions.PublicationStatus.UnderAutomaticChecking &&
            status != IPublicationSessions.PublicationStatus.Incomplete
        ) revert InvalidSessionStatus();

        batch = _latestBatch[sessionId] + 1;
        if (batch == 0) revert InvalidBatch();

        uint64 ts = uint64(block.timestamp);
        _records[sessionId][batch] = AutomaticCheckRecord({
            exists: true,
            sessionId: sessionId,
            batch: batch,
            reportHash: reportHash,
            flagsHash: flagsHash,
            reportURI: reportURI,
            result: result,
            recordedAt: ts
        });
        _latestBatch[sessionId] = batch;

        emit AutomaticCheckRecorded(sessionId, batch, reportHash, flagsHash, reportURI, result, ts);

        if (result == AutomaticCheckResult.Pass) {
            _publicationSessions.updateStatus(
                sessionId,
                IPublicationSessions.PublicationStatus.UnderAnonymization
            );
        } else if (result == AutomaticCheckResult.Incomplete) {
            _publicationSessions.updateStatus(
                sessionId,
                IPublicationSessions.PublicationStatus.Incomplete
            );
        } else if (result == AutomaticCheckResult.Reject) {
            _publicationSessions.updateStatus(
                sessionId,
                IPublicationSessions.PublicationStatus.Rejected
            );
        }
    }

    function admin() external view override returns (address) {
        return _admin;
    }
    function isSessionManager(address addr) external view override returns (bool) {
        return _sessionManagers[addr];
    }
    function getLatestBatch(bytes32 sessionId) external view override returns (uint32) {
        return _latestBatch[sessionId];
    }
    function hasRecord(bytes32 sessionId, uint32 batch) external view override returns (bool) {
        return _records[sessionId][batch].exists;
    }

    function getRecord(
        bytes32 sessionId,
        uint32 batch
    ) external view override returns (AutomaticCheckRecord memory) {
        AutomaticCheckRecord memory r = _records[sessionId][batch];
        if (!r.exists) revert RecordNotFound();
        return r;
    }

    function getLatestRecord(
        bytes32 sessionId
    ) external view override returns (AutomaticCheckRecord memory) {
        uint32 batch = _latestBatch[sessionId];
        if (batch == 0) revert RecordNotFound();
        return _records[sessionId][batch];
    }
}
