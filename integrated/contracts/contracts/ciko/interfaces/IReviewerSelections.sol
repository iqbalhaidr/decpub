// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IReviewerSelections {
    struct ReviewerSelectionBatch {
        bool exists;
        bytes32 sessionId;
        uint32 batch;
        bytes32 criteriaHash;
        uint16 reviewerCount;
        uint16 selectedCount;
        uint64 recordedAt;
    }

    struct SelectedReviewer {
        bool exists;
        bytes32 sessionId;
        uint32 batch;
        bytes32 reviewerAssignmentCommitment;
        uint64 recordedAt;
    }

    event SessionManagerUpdated(address indexed manager, bool authorized, uint64 timestamp);

    event ReviewerSelectionBatchRecorded(
        bytes32 indexed sessionId,
        uint32 indexed batch,
        bytes32 indexed criteriaHash,
        uint16 reviewerCount,
        uint16 selectedCount,
        uint64 recordedAt
    );

    event ReviewerSelected(
        bytes32 indexed sessionId,
        uint32 indexed batch,
        bytes32 indexed reviewerAssignmentCommitment,
        uint64 recordedAt
    );

    error OnlyAdmin();
    error OnlySessionManager();
    error SessionNotFound();
    error InvalidSessionId();
    error InvalidHash();
    error InvalidReviewerCount();
    error InvalidCommitment();
    error InvalidSessionStatus();
    error BatchAlreadyExists();
    error BatchNotFound();
    error SelectionAlreadyExists();
    error LengthMismatch();

    function setSessionManager(address manager, bool authorized) external;

    function recordSelectionBatch(
        bytes32 sessionId,
        bytes32 criteriaHash,
        uint16 reviewerCount,
        bytes32[] calldata reviewerAssignmentCommitments
    ) external returns (uint32 batch);

    function admin() external view returns (address);

    function isSessionManager(address addr) external view returns (bool);

    function getLatestBatch(bytes32 sessionId) external view returns (uint32);

    function hasBatch(bytes32 sessionId, uint32 batch) external view returns (bool);

    function hasSelection(
        bytes32 sessionId,
        uint32 batch,
        bytes32 reviewerAssignmentCommitment
    ) external view returns (bool);

    function getBatch(
        bytes32 sessionId,
        uint32 batch
    ) external view returns (ReviewerSelectionBatch memory);

    function getSelectedReviewer(
        bytes32 sessionId,
        uint32 batch,
        bytes32 reviewerAssignmentCommitment
    ) external view returns (SelectedReviewer memory);

    function getSelectedReviewerCount(
        bytes32 sessionId,
        uint32 batch
    ) external view returns (uint256);
}
