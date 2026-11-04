// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IReviewSubmissions {
    enum ReviewRecommendation {
        None,
        Reject,
        MajorRevision,
        MinorRevision,
        AcceptAsIs
    }

    enum ReviewPhase {
        None,
        Commit,
        Reveal,
        Closed
    }

    struct ReviewCommitRecord {
        bool exists;
        bytes32 sessionId;
        address reviewerPseudonym;
        bytes32 assignmentCommitment;
        bytes32 commitHash;
        bool revealed;
        uint64 committedAt;
        uint64 revealedAt;
    }

    struct ReviewRevealRecord {
        bool exists;
        bytes32 sessionId;
        address reviewerPseudonym;
        bytes32 assignmentCommitment;
        ReviewRecommendation recommendation;
        bytes32 reviewHash;
        string reviewURI;
        bytes32 nonce;
        uint64 revealedAt;
    }

    event SessionManagerUpdated(address indexed manager, bool authorized, uint64 timestamp);

    event ReviewPhaseUpdated(
        bytes32 indexed sessionId,
        ReviewPhase previousPhase,
        ReviewPhase newPhase,
        uint64 updatedAt
    );

    event ReviewCommitted(
        bytes32 indexed sessionId,
        address indexed reviewerPseudonym,
        bytes32 indexed assignmentCommitment,
        bytes32 commitHash,
        uint64 committedAt
    );

    event ReviewRevealed(
        bytes32 indexed sessionId,
        address indexed reviewerPseudonym,
        bytes32 indexed assignmentCommitment,
        ReviewRecommendation recommendation,
        bytes32 reviewHash,
        string reviewURI,
        uint64 revealedAt
    );

    error OnlyAdmin();
    error OnlySessionManager();
    error SessionNotFound();
    error InvalidSessionId();
    error InvalidPseudonym();
    error InvalidCommitment();
    error InvalidHash();
    error InvalidRecommendation();
    error InvalidSessionStatus();
    error InvalidPhase();
    error UnauthorizedReviewer();
    error CommitAlreadyExists();
    error CommitNotFound();
    error RevealAlreadyExists();
    error InvalidReveal();

    function setSessionManager(address manager, bool authorized) external;

    function setReviewPhase(bytes32 sessionId, ReviewPhase newPhase) external;

    function commitReview(
        bytes32 sessionId,
        address reviewerPseudonym,
        bytes32 assignmentCommitment,
        bytes32 commitHash
    ) external;

    function revealReview(
        bytes32 sessionId,
        address reviewerPseudonym,
        bytes32 assignmentCommitment,
        ReviewRecommendation recommendation,
        bytes32 reviewHash,
        string calldata reviewURI,
        bytes32 nonce
    ) external;

    function admin() external view returns (address);

    function isSessionManager(address addr) external view returns (bool);

    function getReviewPhase(bytes32 sessionId) external view returns (ReviewPhase);

    function hasCommit(bytes32 sessionId, address reviewerPseudonym) external view returns (bool);

    function hasReveal(bytes32 sessionId, address reviewerPseudonym) external view returns (bool);

    function getCommitRecord(
        bytes32 sessionId,
        address reviewerPseudonym
    ) external view returns (ReviewCommitRecord memory);

    function getRevealRecord(
        bytes32 sessionId,
        address reviewerPseudonym
    ) external view returns (ReviewRevealRecord memory);

    function computeCommitHash(
        bytes32 sessionId,
        address reviewerPseudonym,
        ReviewRecommendation recommendation,
        bytes32 reviewHash,
        string calldata reviewURI,
        bytes32 nonce
    ) external pure returns (bytes32);
}
