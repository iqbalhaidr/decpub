// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IPublicationSessions.sol";
import "./interfaces/IEphemeralAccounts.sol";

contract PublicationSessions is IPublicationSessions {
    address private _admin;
    IEphemeralAccounts private immutable _ephemeralAccounts;

    mapping(bytes32 => PublicationSession) private _sessions;
    mapping(address => bool) private _sessionManagers;

    modifier onlyAdmin() {
        if (msg.sender != _admin) revert OnlyAdmin();
        _;
    }

    modifier onlySessionManager() {
        if (!_sessionManagers[msg.sender]) revert OnlySessionManager();
        _;
    }

    modifier sessionMustExist(bytes32 sessionId) {
        if (!_sessions[sessionId].exists) revert SessionNotFound();
        _;
    }

    constructor(address ephemeralAccountsAddr) {
        _admin = msg.sender;
        _ephemeralAccounts = IEphemeralAccounts(ephemeralAccountsAddr);
    }

    function setSessionManager(address manager, bool authorized) external override onlyAdmin {
        _sessionManagers[manager] = authorized;
    }

    function createSession(
        bytes32 sessionId,
        address authorPseudonym,
        bytes32 originalManuscriptHash,
        bytes32 anonymizedManuscriptHash,
        bytes32 metadataHash,
        string calldata anonymizedManuscriptURI,
        string calldata metadataURI
    ) external override onlySessionManager {
        if (sessionId == bytes32(0)) revert InvalidSessionId();
        if (authorPseudonym == address(0)) revert InvalidPseudonym();
        if (originalManuscriptHash == bytes32(0)) revert InvalidHash();
        if (anonymizedManuscriptHash == bytes32(0)) revert InvalidHash();
        if (metadataHash == bytes32(0)) revert InvalidHash();
        if (_sessions[sessionId].exists) revert SessionAlreadyExists();

        IEphemeralAccounts.EphemeralAccount memory acc = _ephemeralAccounts.getAccount(
            authorPseudonym
        );
        if (!_ephemeralAccounts.isActive(authorPseudonym)) revert InvalidPseudonym();
        if (acc.role != IEphemeralAccounts.Role.Author) revert UnauthorizedRole();
        if (acc.sessionId != sessionId) revert InvalidSessionId();

        uint64 ts = uint64(block.timestamp);
        _sessions[sessionId] = PublicationSession({
            exists: true,
            sessionId: sessionId,
            authorPseudonym: authorPseudonym,
            editorPseudonym: address(0),
            originalManuscriptHash: originalManuscriptHash,
            anonymizedManuscriptHash: anonymizedManuscriptHash,
            metadataHash: metadataHash,
            anonymizedManuscriptURI: anonymizedManuscriptURI,
            metadataURI: metadataURI,
            status: PublicationStatus.Submitted,
            createdAt: ts,
            updatedAt: ts,
            revisionCount: 0
        });

        emit PublicationSessionCreated(
            sessionId,
            authorPseudonym,
            originalManuscriptHash,
            anonymizedManuscriptHash,
            metadataHash,
            anonymizedManuscriptURI,
            metadataURI,
            ts
        );
    }

    function assignEditor(
        bytes32 sessionId,
        address editorPseudonym
    ) external override onlySessionManager sessionMustExist(sessionId) {
        if (editorPseudonym == address(0)) revert InvalidPseudonym();
        PublicationSession storage session = _sessions[sessionId];
        if (session.editorPseudonym != address(0)) revert EditorAlreadyAssigned();
        if (session.status != PublicationStatus.UnderEditorialScreening)
            revert InvalidStatusTransition();

        IEphemeralAccounts.EphemeralAccount memory acc = _ephemeralAccounts.getAccount(
            editorPseudonym
        );
        if (!_ephemeralAccounts.isActive(editorPseudonym)) revert InvalidPseudonym();
        if (acc.role != IEphemeralAccounts.Role.Editor) revert UnauthorizedRole();
        if (acc.sessionId != sessionId) revert InvalidSessionId();

        session.editorPseudonym = editorPseudonym;
        session.updatedAt = uint64(block.timestamp);
        emit EditorAssigned(sessionId, editorPseudonym, uint64(block.timestamp));
    }

    function updateStatus(
        bytes32 sessionId,
        PublicationStatus newStatus
    ) external override onlySessionManager sessionMustExist(sessionId) {
        _updateStatusInternal(sessionId, newStatus);
    }

    function recordRevision(
        bytes32 sessionId,
        bytes32 newOriginalManuscriptHash,
        bytes32 newAnonymizedManuscriptHash,
        bytes32 newMetadataHash,
        string calldata newAnonymizedManuscriptURI,
        string calldata newMetadataURI
    ) external override onlySessionManager sessionMustExist(sessionId) {
        if (newOriginalManuscriptHash == bytes32(0)) revert InvalidHash();
        if (newAnonymizedManuscriptHash == bytes32(0)) revert InvalidHash();
        if (newMetadataHash == bytes32(0)) revert InvalidHash();

        PublicationSession storage session = _sessions[sessionId];
        PublicationStatus prev = session.status;

        if (
            prev != PublicationStatus.MinorRevisionRequired &&
            prev != PublicationStatus.MajorRevisionRequired
        ) {
            revert InvalidStatusTransition();
        }

        session.originalManuscriptHash = newOriginalManuscriptHash;
        session.anonymizedManuscriptHash = newAnonymizedManuscriptHash;
        session.metadataHash = newMetadataHash;
        session.anonymizedManuscriptURI = newAnonymizedManuscriptURI;
        session.metadataURI = newMetadataURI;
        session.revisionCount += 1;
        session.updatedAt = uint64(block.timestamp);

        emit ManuscriptRevisionRecorded(
            sessionId,
            newOriginalManuscriptHash,
            newAnonymizedManuscriptHash,
            newMetadataHash,
            newAnonymizedManuscriptURI,
            newMetadataURI,
            session.revisionCount,
            uint64(block.timestamp)
        );

        PublicationStatus next =
            prev == PublicationStatus.MinorRevisionRequired
                ? PublicationStatus.AssigningReviewers
                : PublicationStatus.UnderEditorialScreening;

        session.status = next;
        session.updatedAt = uint64(block.timestamp);
        emit PublicationStatusUpdated(sessionId, prev, next, uint64(block.timestamp));
    }

    function recordReviewerCriteria(
        bytes32 sessionId,
        bytes32 criteriaHash,
        uint16 reviewerCount
    ) external override onlySessionManager sessionMustExist(sessionId) {
        if (criteriaHash == bytes32(0)) revert InvalidHash();
        if (reviewerCount == 0) revert InvalidReviewerCount();

        PublicationSession storage session = _sessions[sessionId];
        if (
            session.status != PublicationStatus.UnderEditorialScreening &&
            session.status != PublicationStatus.AssigningReviewers
        ) {
            revert InvalidStatusTransition();
        }

        session.updatedAt = uint64(block.timestamp);
        emit ReviewerCriteriaRecorded(
            sessionId,
            criteriaHash,
            reviewerCount,
            uint64(block.timestamp)
        );
    }

    function admin() external view override returns (address) {
        return _admin;
    }
    function isSessionManager(address addr) external view override returns (bool) {
        return _sessionManagers[addr];
    }
    function exists(bytes32 sessionId) external view override returns (bool) {
        return _sessions[sessionId].exists;
    }

    function getSession(
        bytes32 sessionId
    ) external view override returns (PublicationSession memory) {
        if (!_sessions[sessionId].exists) revert SessionNotFound();
        return _sessions[sessionId];
    }

    function _updateStatusInternal(bytes32 sessionId, PublicationStatus newStatus) internal {
        PublicationSession storage session = _sessions[sessionId];
        PublicationStatus prev = session.status;
        if (newStatus == PublicationStatus.None) revert InvalidStatus();
        if (prev == newStatus) revert InvalidStatus();
        if (!_isValidTransition(prev, newStatus)) revert InvalidStatusTransition();

        session.status = newStatus;
        session.updatedAt = uint64(block.timestamp);
        emit PublicationStatusUpdated(sessionId, prev, newStatus, uint64(block.timestamp));
    }

    function _isValidTransition(
        PublicationStatus from,
        PublicationStatus to
    ) internal pure returns (bool) {
        if (from == PublicationStatus.Submitted)
            return
                to == PublicationStatus.UnderAutomaticChecking ||
                to == PublicationStatus.Incomplete ||
                to == PublicationStatus.UnderAnonymization ||
                to == PublicationStatus.Rejected;
        if (from == PublicationStatus.UnderAutomaticChecking)
            return
                to == PublicationStatus.Incomplete ||
                to == PublicationStatus.UnderAnonymization ||
                to == PublicationStatus.Rejected;
        if (from == PublicationStatus.Incomplete)
            return
                to == PublicationStatus.UnderAutomaticChecking ||
                to == PublicationStatus.UnderAnonymization ||
                to == PublicationStatus.Rejected;
        if (from == PublicationStatus.UnderAnonymization)
            return
                to == PublicationStatus.UnderEditorialScreening || to == PublicationStatus.Rejected;
        if (from == PublicationStatus.UnderEditorialScreening)
            return
                to == PublicationStatus.AssigningReviewers ||
                to == PublicationStatus.MinorRevisionRequired ||
                to == PublicationStatus.MajorRevisionRequired ||
                to == PublicationStatus.Rejected;
        if (from == PublicationStatus.AssigningReviewers)
            return to == PublicationStatus.UnderReview;
        if (from == PublicationStatus.UnderReview)
            return
                to == PublicationStatus.MinorRevisionRequired ||
                to == PublicationStatus.MajorRevisionRequired ||
                to == PublicationStatus.Accepted ||
                to == PublicationStatus.Rejected ||
                to == PublicationStatus.AssigningReviewers;
        if (from == PublicationStatus.Accepted) return to == PublicationStatus.Published;
        return false;
    }
}
