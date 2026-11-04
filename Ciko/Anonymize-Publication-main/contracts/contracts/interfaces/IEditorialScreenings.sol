// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IEditorialScreenings {
    enum DeskReviewDecision {
        None,
        ProceedToReviewerSelection,
        ReviseBeforeReview,
        DeskReject
    }

    struct EditorialScreeningRecord {
        bool exists;
        bytes32 sessionId;
        uint32 revision;
        address editorPseudonym;
        bytes32 editorialReportHash;
        bytes32 anonymousEditorialReportHash;
        string anonymousEditorialReportURI;
        DeskReviewDecision decision;
        uint64 recordedAt;
    }

    event SessionManagerUpdated(address indexed manager, bool authorized, uint64 timestamp);

    event EditorialScreeningRecorded(
        bytes32 indexed sessionId,
        uint32 indexed revision,
        address indexed editorPseudonym,
        bytes32 editorialReportHash,
        bytes32 anonymousEditorialReportHash,
        string anonymousEditorialReportURI,
        DeskReviewDecision decision,
        uint64 recordedAt
    );

    error OnlyAdmin();
    error OnlySessionManager();
    error SessionNotFound();
    error InvalidSessionId();
    error InvalidPseudonym();
    error InvalidHash();
    error InvalidDecision();
    error InvalidSessionStatus();
    error UnauthorizedEditor();
    error RecordAlreadyExists();
    error RecordNotFound();

    function setSessionManager(address manager, bool authorized) external;

    function recordEditorialScreening(
        bytes32 sessionId,
        address editorPseudonym,
        bytes32 editorialReportHash,
        bytes32 anonymousEditorialReportHash,
        string calldata anonymousEditorialReportURI,
        DeskReviewDecision decision
    ) external returns (uint32 revision);

    function admin() external view returns (address);

    function isSessionManager(address addr) external view returns (bool);

    function hasRecord(bytes32 sessionId, uint32 revision) external view returns (bool);

    function getRecord(
        bytes32 sessionId,
        uint32 revision
    ) external view returns (EditorialScreeningRecord memory);

    function getLatestRecord(
        bytes32 sessionId
    ) external view returns (EditorialScreeningRecord memory);
}
