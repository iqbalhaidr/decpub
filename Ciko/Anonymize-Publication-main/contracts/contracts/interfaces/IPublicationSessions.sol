// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IPublicationSessions {
    enum PublicationStatus {
        None,
        Submitted,
        UnderAutomaticChecking,
        Incomplete,
        UnderAnonymization,
        UnderEditorialScreening,
        MinorRevisionRequired,
        MajorRevisionRequired,
        AssigningReviewers,
        UnderReview,
        Accepted,
        Rejected,
        Published
    }

    struct PublicationSession {
        bool exists;
        bytes32 sessionId;
        address authorPseudonym;
        address editorPseudonym;
        bytes32 originalManuscriptHash;
        bytes32 anonymizedManuscriptHash;
        bytes32 metadataHash;
        string anonymizedManuscriptURI;
        string metadataURI;
        PublicationStatus status;
        uint64 createdAt;
        uint64 updatedAt;
        uint32 revisionCount;
    }

    event PublicationSessionCreated(
        bytes32 indexed sessionId,
        address indexed authorPseudonym,
        bytes32 indexed originalManuscriptHash,
        bytes32 anonymizedManuscriptHash,
        bytes32 metadataHash,
        string anonymizedManuscriptURI,
        string metadataURI,
        uint64 createdAt
    );

    event PublicationStatusUpdated(
        bytes32 indexed sessionId,
        PublicationStatus previousStatus,
        PublicationStatus newStatus,
        uint64 updatedAt
    );

    event EditorAssigned(
        bytes32 indexed sessionId,
        address indexed editorPseudonym,
        uint64 assignedAt
    );

    event ManuscriptRevisionRecorded(
        bytes32 indexed sessionId,
        bytes32 indexed originalManuscriptHash,
        bytes32 anonymizedManuscriptHash,
        bytes32 metadataHash,
        string anonymizedManuscriptURI,
        string metadataURI,
        uint32 revisionCount,
        uint64 updatedAt
    );

    event ReviewerCriteriaRecorded(
        bytes32 indexed sessionId,
        bytes32 indexed criteriaHash,
        uint16 reviewerCount,
        uint64 recordedAt
    );

    error OnlyAdmin();
    error OnlySessionManager();
    error SessionAlreadyExists();
    error SessionNotFound();
    error InvalidSessionId();
    error InvalidPseudonym();
    error InvalidHash();
    error InvalidStatus();
    error InvalidReviewerCount();
    error UnauthorizedRole();
    error InvalidStatusTransition();
    error EditorAlreadyAssigned();

    function createSession(
        bytes32 sessionId,
        address authorPseudonym,
        bytes32 originalManuscriptHash,
        bytes32 anonymizedManuscriptHash,
        bytes32 metadataHash,
        string calldata anonymizedManuscriptURI,
        string calldata metadataURI
    ) external;

    function assignEditor(bytes32 sessionId, address editorPseudonym) external;

    function updateStatus(bytes32 sessionId, PublicationStatus newStatus) external;

    function recordRevision(
        bytes32 sessionId,
        bytes32 newOriginalManuscriptHash,
        bytes32 newAnonymizedManuscriptHash,
        bytes32 newMetadataHash,
        string calldata newAnonymizedManuscriptURI,
        string calldata newMetadataURI
    ) external;

    function recordReviewerCriteria(
        bytes32 sessionId,
        bytes32 criteriaHash,
        uint16 reviewerCount
    ) external;

    function setSessionManager(address manager, bool authorized) external;

    function admin() external view returns (address);

    function isSessionManager(address addr) external view returns (bool);

    function exists(bytes32 sessionId) external view returns (bool);

    function getSession(bytes32 sessionId) external view returns (PublicationSession memory);
}
