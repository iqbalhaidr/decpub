// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IEditorialScreenings.sol";
import "./interfaces/IPublicationSessions.sol";
import "./interfaces/IEphemeralAccounts.sol";

contract EditorialScreenings is IEditorialScreenings {
    address private _admin;
    IPublicationSessions private immutable _publicationSessions;
    IEphemeralAccounts private immutable _ephemeralAccounts;

    mapping(address => bool) private _sessionManagers;
    mapping(bytes32 => mapping(uint32 => EditorialScreeningRecord)) private _records;

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

    constructor(address ephemeralAccountsAddr, address publicationSessionsAddr) {
        _admin = msg.sender;
        _ephemeralAccounts = IEphemeralAccounts(ephemeralAccountsAddr);
        _publicationSessions = IPublicationSessions(publicationSessionsAddr);
    }

    function setSessionManager(address manager, bool authorized) external override onlyAdmin {
        _sessionManagers[manager] = authorized;
        emit SessionManagerUpdated(manager, authorized, uint64(block.timestamp));
    }

    function recordEditorialScreening(
        bytes32 sessionId,
        address editorPseudonym,
        bytes32 editorialReportHash,
        bytes32 anonymousEditorialReportHash,
        string calldata anonymousEditorialReportURI,
        DeskReviewDecision decision
    ) external override onlySessionManager sessionMustExist(sessionId) returns (uint32 revision) {
        if (editorPseudonym == address(0)) revert InvalidPseudonym();
        if (editorialReportHash == bytes32(0)) revert InvalidHash();
        if (anonymousEditorialReportHash == bytes32(0)) revert InvalidHash();
        if (decision == DeskReviewDecision.None) revert InvalidDecision();

        IPublicationSessions.PublicationSession memory session = _publicationSessions.getSession(
            sessionId
        );
        if (session.status != IPublicationSessions.PublicationStatus.UnderEditorialScreening)
            revert InvalidSessionStatus();
        if (session.editorPseudonym != editorPseudonym) revert UnauthorizedEditor();

        if (!_ephemeralAccounts.isActive(editorPseudonym)) revert InvalidPseudonym();
        IEphemeralAccounts.EphemeralAccount memory acc = _ephemeralAccounts.getAccount(
            editorPseudonym
        );
        if (acc.role != IEphemeralAccounts.Role.Editor) revert UnauthorizedEditor();
        if (acc.sessionId != sessionId) revert InvalidSessionId();

        revision = session.revisionCount;
        if (_records[sessionId][revision].exists) revert RecordAlreadyExists();

        uint64 ts = uint64(block.timestamp);
        _records[sessionId][revision] = EditorialScreeningRecord({
            exists: true,
            sessionId: sessionId,
            revision: revision,
            editorPseudonym: editorPseudonym,
            editorialReportHash: editorialReportHash,
            anonymousEditorialReportHash: anonymousEditorialReportHash,
            anonymousEditorialReportURI: anonymousEditorialReportURI,
            decision: decision,
            recordedAt: ts
        });

        emit EditorialScreeningRecorded(
            sessionId,
            revision,
            editorPseudonym,
            editorialReportHash,
            anonymousEditorialReportHash,
            anonymousEditorialReportURI,
            decision,
            ts
        );

        if (decision == DeskReviewDecision.ProceedToReviewerSelection) {
            _publicationSessions.updateStatus(
                sessionId,
                IPublicationSessions.PublicationStatus.AssigningReviewers
            );
        } else if (decision == DeskReviewDecision.ReviseBeforeReview) {
            _publicationSessions.updateStatus(
                sessionId,
                IPublicationSessions.PublicationStatus.MajorRevisionRequired
            );
        } else if (decision == DeskReviewDecision.DeskReject) {
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
    function hasRecord(bytes32 sessionId, uint32 revision) external view override returns (bool) {
        return _records[sessionId][revision].exists;
    }

    function getRecord(
        bytes32 sessionId,
        uint32 revision
    ) external view override returns (EditorialScreeningRecord memory) {
        EditorialScreeningRecord memory r = _records[sessionId][revision];
        if (!r.exists) revert RecordNotFound();
        return r;
    }

    function getLatestRecord(
        bytes32 sessionId
    ) external view override returns (EditorialScreeningRecord memory) {
        IPublicationSessions.PublicationSession memory session = _publicationSessions.getSession(
            sessionId
        );
        EditorialScreeningRecord memory r = _records[sessionId][session.revisionCount];
        if (!r.exists) revert RecordNotFound();
        return r;
    }
}
