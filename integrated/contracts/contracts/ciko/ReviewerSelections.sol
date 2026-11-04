// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IReviewerSelections.sol";
import "./interfaces/IPublicationSessions.sol";

contract ReviewerSelections is IReviewerSelections {
    address private _admin;
    IPublicationSessions private immutable _publicationSessions;

    mapping(address => bool) private _sessionManagers;
    mapping(bytes32 => uint32) private _latestBatch;
    mapping(bytes32 => mapping(uint32 => ReviewerSelectionBatch)) private _batches;
    mapping(bytes32 => mapping(uint32 => mapping(bytes32 => SelectedReviewer))) private _selected;
    mapping(bytes32 => mapping(uint32 => uint256)) private _selectedCounts;

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

    function recordSelectionBatch(
        bytes32 sessionId,
        bytes32 criteriaHash,
        uint16 reviewerCount,
        bytes32[] calldata reviewerAssignmentCommitments
    ) external override onlySessionManager sessionMustExist(sessionId) returns (uint32 batch) {
        if (criteriaHash == bytes32(0)) revert InvalidHash();
        if (reviewerCount == 0) revert InvalidReviewerCount();
        if (reviewerAssignmentCommitments.length == 0) revert InvalidReviewerCount();
        if (reviewerAssignmentCommitments.length != reviewerCount) revert LengthMismatch();

        IPublicationSessions.PublicationStatus status = _publicationSessions
            .getSession(sessionId)
            .status;
        if (status != IPublicationSessions.PublicationStatus.AssigningReviewers)
            revert InvalidSessionStatus();

        batch = _latestBatch[sessionId] + 1;
        if (_batches[sessionId][batch].exists) revert BatchAlreadyExists();

        uint64 ts = uint64(block.timestamp);
        _batches[sessionId][batch] = ReviewerSelectionBatch({
            exists: true,
            sessionId: sessionId,
            batch: batch,
            criteriaHash: criteriaHash,
            reviewerCount: reviewerCount,
            selectedCount: uint16(reviewerAssignmentCommitments.length),
            recordedAt: ts
        });
        _latestBatch[sessionId] = batch;

        uint256 length = reviewerAssignmentCommitments.length;
        for (uint256 i; i < length; ) {
            bytes32 commitment = reviewerAssignmentCommitments[i];
            if (commitment == bytes32(0)) revert InvalidCommitment();
            if (_selected[sessionId][batch][commitment].exists) revert SelectionAlreadyExists();
            _selected[sessionId][batch][commitment] = SelectedReviewer({
                exists: true,
                sessionId: sessionId,
                batch: batch,
                reviewerAssignmentCommitment: commitment,
                recordedAt: ts
            });
            _selectedCounts[sessionId][batch] += 1;
            emit ReviewerSelected(sessionId, batch, commitment, ts);
            unchecked {
                ++i;
            }
        }

        emit ReviewerSelectionBatchRecorded(
            sessionId,
            batch,
            criteriaHash,
            reviewerCount,
            uint16(length),
            ts
        );
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
    function hasBatch(bytes32 sessionId, uint32 batch) external view override returns (bool) {
        return _batches[sessionId][batch].exists;
    }

    function hasSelection(
        bytes32 sessionId,
        uint32 batch,
        bytes32 commitment
    ) external view override returns (bool) {
        return _selected[sessionId][batch][commitment].exists;
    }

    function getBatch(
        bytes32 sessionId,
        uint32 batch
    ) external view override returns (ReviewerSelectionBatch memory) {
        ReviewerSelectionBatch memory b = _batches[sessionId][batch];
        if (!b.exists) revert BatchNotFound();
        return b;
    }

    function getSelectedReviewer(
        bytes32 sessionId,
        uint32 batch,
        bytes32 commitment
    ) external view override returns (SelectedReviewer memory) {
        SelectedReviewer memory r = _selected[sessionId][batch][commitment];
        if (!r.exists) revert BatchNotFound();
        return r;
    }

    function getSelectedReviewerCount(
        bytes32 sessionId,
        uint32 batch
    ) external view override returns (uint256) {
        if (!_batches[sessionId][batch].exists) revert BatchNotFound();
        return _selectedCounts[sessionId][batch];
    }
}
