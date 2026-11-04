// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IAssignmentProofs.sol";
import "./interfaces/IPublicationSessions.sol";
import "./interfaces/IEphemeralAccounts.sol";

contract AssignmentProofs is IAssignmentProofs {
    address private _admin;
    IEphemeralAccounts private immutable _ephemeralAccounts;
    IPublicationSessions private immutable _publicationSessions;

    mapping(address => bool) private _sessionManagers;
    mapping(bytes32 => EditorAssignmentProof) private _editorProofs;
    mapping(bytes32 => mapping(bytes32 => ReviewerAssignmentProof)) private _reviewerProofs;
    mapping(bytes32 => uint256) private _reviewerProofCount;

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

    function recordEditorAssignmentProof(
        bytes32 sessionId,
        address editorPseudonym,
        bytes32 proofRef
    ) external override onlySessionManager sessionMustExist(sessionId) {
        if (editorPseudonym == address(0)) revert InvalidPseudonym();
        if (proofRef == bytes32(0)) revert InvalidReference();
        if (_editorProofs[sessionId].exists) revert EditorAlreadyRecorded();

        IPublicationSessions.PublicationSession memory session = _publicationSessions.getSession(
            sessionId
        );
        IPublicationSessions.PublicationStatus status = session.status;

        if (
            status != IPublicationSessions.PublicationStatus.UnderEditorialScreening &&
            status != IPublicationSessions.PublicationStatus.AssigningReviewers
        ) {
            revert InvalidSessionStatus();
        }
        if (session.editorPseudonym != editorPseudonym) revert EditorMismatch();
        if (!_ephemeralAccounts.isActive(editorPseudonym)) revert InvalidPseudonym();

        IEphemeralAccounts.EphemeralAccount memory acc = _ephemeralAccounts.getAccount(
            editorPseudonym
        );
        if (acc.role != IEphemeralAccounts.Role.Editor) revert UnauthorizedRole();
        if (acc.sessionId != sessionId) revert InvalidSessionId();

        uint64 ts = uint64(block.timestamp);
        _editorProofs[sessionId] = EditorAssignmentProof({
            exists: true,
            sessionId: sessionId,
            editorPseudonym: editorPseudonym,
            proofRef: proofRef,
            recordedAt: ts
        });
        emit EditorAssignmentProofRecorded(sessionId, editorPseudonym, proofRef, ts);
    }

    function recordReviewerAssignmentProof(
        bytes32 sessionId,
        bytes32 reviewerAssignmentCommitment,
        bytes32 inviteRef,
        bytes32 proofRef
    ) external override onlySessionManager sessionMustExist(sessionId) {
        _recordReviewerProof(sessionId, reviewerAssignmentCommitment, inviteRef, proofRef);
    }

    function batchRecordReviewerAssignmentProofs(
        bytes32 sessionId,
        bytes32[] calldata reviewerAssignmentCommitments,
        bytes32[] calldata inviteRefs,
        bytes32[] calldata proofRefs
    ) external override onlySessionManager sessionMustExist(sessionId) {
        uint256 length = reviewerAssignmentCommitments.length;
        if (length == 0) revert LengthMismatch();
        if (inviteRefs.length != length) revert LengthMismatch();
        if (proofRefs.length != length) revert LengthMismatch();
        for (uint256 i; i < length; ) {
            _recordReviewerProof(
                sessionId,
                reviewerAssignmentCommitments[i],
                inviteRefs[i],
                proofRefs[i]
            );
            unchecked {
                ++i;
            }
        }
    }

    function admin() external view override returns (address) {
        return _admin;
    }
    function isSessionManager(address addr) external view override returns (bool) {
        return _sessionManagers[addr];
    }
    function hasEditorAssignmentProof(bytes32 sessionId) external view override returns (bool) {
        return _editorProofs[sessionId].exists;
    }

    function hasReviewerAssignmentProof(
        bytes32 sessionId,
        bytes32 commitment
    ) external view override returns (bool) {
        return _reviewerProofs[sessionId][commitment].exists;
    }

    function getEditorAssignmentProof(
        bytes32 sessionId
    ) external view override returns (EditorAssignmentProof memory) {
        EditorAssignmentProof memory p = _editorProofs[sessionId];
        if (!p.exists) revert ProofNotFound();
        return p;
    }

    function getReviewerAssignmentProof(
        bytes32 sessionId,
        bytes32 commitment
    ) external view override returns (ReviewerAssignmentProof memory) {
        ReviewerAssignmentProof memory p = _reviewerProofs[sessionId][commitment];
        if (!p.exists) revert ProofNotFound();
        return p;
    }

    function getReviewerAssignmentProofCount(
        bytes32 sessionId
    ) external view override returns (uint256) {
        return _reviewerProofCount[sessionId];
    }

    function _recordReviewerProof(
        bytes32 sessionId,
        bytes32 commitment,
        bytes32 inviteRef,
        bytes32 proofRef
    ) internal {
        if (commitment == bytes32(0)) revert InvalidCommitment();
        if (inviteRef == bytes32(0)) revert InvalidReference();
        if (proofRef == bytes32(0)) revert InvalidReference();

        IPublicationSessions.PublicationStatus status = _publicationSessions
            .getSession(sessionId)
            .status;
        if (
            status != IPublicationSessions.PublicationStatus.UnderEditorialScreening &&
            status != IPublicationSessions.PublicationStatus.AssigningReviewers
        ) {
            revert InvalidSessionStatus();
        }
        if (_reviewerProofs[sessionId][commitment].exists) revert ProofAlreadyExists();

        uint64 ts = uint64(block.timestamp);
        _reviewerProofs[sessionId][commitment] = ReviewerAssignmentProof({
            exists: true,
            sessionId: sessionId,
            reviewerAssignmentCommitment: commitment,
            inviteRef: inviteRef,
            proofRef: proofRef,
            recordedAt: ts
        });
        _reviewerProofCount[sessionId] += 1;
        emit ReviewerAssignmentProofRecorded(sessionId, commitment, inviteRef, proofRef, ts);
    }
}
