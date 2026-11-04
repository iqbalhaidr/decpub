// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IReviewDecisions {
    enum DecisionOutcome {
        None,
        Reject,
        MajorRevision,
        MinorRevision,
        AcceptAsIs
    }

    struct DecisionBatch {
        bool exists;
        bytes32 sessionId;
        uint32 batch;
        uint16 reviewerCount;
        uint16 rejectCount;
        uint16 majorRevisionCount;
        uint16 minorRevisionCount;
        uint16 acceptAsIsCount;
        bool grayZone;
        uint16 additionalReviewerCount;
        DecisionOutcome outcome;
        uint64 decidedAt;
    }

    event SessionManagerUpdated(address indexed manager, bool authorized, uint64 timestamp);

    event ReviewBatchDecided(
        bytes32 indexed sessionId,
        uint32 indexed batch,
        uint16 reviewerCount,
        uint16 rejectCount,
        uint16 majorRevisionCount,
        uint16 minorRevisionCount,
        uint16 acceptAsIsCount,
        bool grayZone,
        uint16 additionalReviewerCount,
        DecisionOutcome outcome,
        uint64 decidedAt
    );

    error OnlyAdmin();
    error OnlySessionManager();
    error SessionNotFound();
    error InvalidSessionId();
    error InvalidSessionStatus();
    error InvalidBatch();
    error InvalidReviewerCount();
    error BatchAlreadyDecided();
    error RevealNotFound();
    error DuplicateReviewer();
    error InvalidOutcome();

    function setSessionManager(address manager, bool authorized) external;

    function decideBatch(
        bytes32 sessionId,
        uint32 batch,
        address[] calldata reviewerPseudonyms,
        uint16 additionalReviewerCountIfGrayZone
    ) external;

    function admin() external view returns (address);

    function isSessionManager(address addr) external view returns (bool);

    function hasDecision(bytes32 sessionId, uint32 batch) external view returns (bool);

    function getDecision(
        bytes32 sessionId,
        uint32 batch
    ) external view returns (DecisionBatch memory);

    function computeOutcome(
        uint16 rejectCount,
        uint16 majorRevisionCount,
        uint16 minorRevisionCount,
        uint16 acceptAsIsCount
    ) external pure returns (bool grayZone, DecisionOutcome outcome);
}
