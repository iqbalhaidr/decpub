// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IReviewSubmissions.sol";
import "./interfaces/IPublicationSessions.sol";
import "./interfaces/IAssignmentProofs.sol";
import "./interfaces/IEphemeralAccounts.sol";

contract ReviewSubmissions is IReviewSubmissions {
    address private _admin;
    IPublicationSessions private immutable _publicationSessions;
    IAssignmentProofs private immutable _assignmentProofs;
    IEphemeralAccounts private immutable _ephemeralAccounts;

    mapping(address => bool) private _sessionManagers;
    mapping(bytes32 => ReviewPhase) private _phases;
    mapping(bytes32 => mapping(address => ReviewCommitRecord)) private _commits;
    mapping(bytes32 => mapping(address => ReviewRevealRecord)) private _reveals;

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

    constructor(
        address ephemeralAccountsAddr,
        address publicationSessionsAddr,
        address assignmentProofsAddr
    ) {
        _admin = msg.sender;
        _ephemeralAccounts = IEphemeralAccounts(ephemeralAccountsAddr);
        _publicationSessions = IPublicationSessions(publicationSessionsAddr);
        _assignmentProofs = IAssignmentProofs(assignmentProofsAddr);
    }

    function setSessionManager(address manager, bool authorized) external override onlyAdmin {
        _sessionManagers[manager] = authorized;
        emit SessionManagerUpdated(manager, authorized, uint64(block.timestamp));
    }

    function setReviewPhase(
        bytes32 sessionId,
        ReviewPhase newPhase
    ) external override onlySessionManager sessionMustExist(sessionId) {
        if (
            newPhase != ReviewPhase.Commit &&
            newPhase != ReviewPhase.Reveal &&
            newPhase != ReviewPhase.Closed
        ) revert InvalidPhase();

        IPublicationSessions.PublicationStatus status = _publicationSessions
            .getSession(sessionId)
            .status;
        if (status != IPublicationSessions.PublicationStatus.UnderReview)
            revert InvalidSessionStatus();

        ReviewPhase prev = _phases[sessionId];
        _phases[sessionId] = newPhase;
        emit ReviewPhaseUpdated(sessionId, prev, newPhase, uint64(block.timestamp));
    }

    function commitReview(
        bytes32 sessionId,
        address reviewerPseudonym,
        bytes32 assignmentCommitment,
        bytes32 commitHash
    ) external override onlySessionManager sessionMustExist(sessionId) {
        if (reviewerPseudonym == address(0)) revert InvalidPseudonym();
        if (assignmentCommitment == bytes32(0)) revert InvalidCommitment();
        if (commitHash == bytes32(0)) revert InvalidHash();
        if (_phases[sessionId] != ReviewPhase.Commit) revert InvalidPhase();

        IPublicationSessions.PublicationStatus status = _publicationSessions
            .getSession(sessionId)
            .status;
        if (status != IPublicationSessions.PublicationStatus.UnderReview)
            revert InvalidSessionStatus();

        if (!_ephemeralAccounts.isActive(reviewerPseudonym)) revert InvalidPseudonym();
        IEphemeralAccounts.EphemeralAccount memory acc = _ephemeralAccounts.getAccount(
            reviewerPseudonym
        );
        if (acc.role != IEphemeralAccounts.Role.Reviewer) revert UnauthorizedReviewer();
        if (acc.sessionId != sessionId) revert InvalidSessionId();

        if (!_assignmentProofs.hasReviewerAssignmentProof(sessionId, assignmentCommitment))
            revert InvalidCommitment();
        if (_commits[sessionId][reviewerPseudonym].exists) revert CommitAlreadyExists();

        uint64 ts = uint64(block.timestamp);
        _commits[sessionId][reviewerPseudonym] = ReviewCommitRecord({
            exists: true,
            sessionId: sessionId,
            reviewerPseudonym: reviewerPseudonym,
            assignmentCommitment: assignmentCommitment,
            commitHash: commitHash,
            revealed: false,
            committedAt: ts,
            revealedAt: 0
        });
        emit ReviewCommitted(sessionId, reviewerPseudonym, assignmentCommitment, commitHash, ts);
    }

    function revealReview(
        bytes32 sessionId,
        address reviewerPseudonym,
        bytes32 assignmentCommitment,
        ReviewRecommendation recommendation,
        bytes32 reviewHash,
        string calldata reviewURI,
        bytes32 nonce
    ) external override onlySessionManager sessionMustExist(sessionId) {
        if (reviewerPseudonym == address(0)) revert InvalidPseudonym();
        if (assignmentCommitment == bytes32(0)) revert InvalidCommitment();
        if (reviewHash == bytes32(0)) revert InvalidHash();
        if (recommendation == ReviewRecommendation.None) revert InvalidRecommendation();
        if (_phases[sessionId] != ReviewPhase.Reveal) revert InvalidPhase();

        ReviewCommitRecord storage commit = _commits[sessionId][reviewerPseudonym];
        if (!commit.exists) revert CommitNotFound();
        if (commit.revealed) revert RevealAlreadyExists();
        if (commit.assignmentCommitment != assignmentCommitment) revert InvalidCommitment();

        bytes32 expected = keccak256(
            abi.encode(sessionId, reviewerPseudonym, recommendation, reviewHash, reviewURI, nonce)
        );
        if (commit.commitHash != expected) revert InvalidReveal();

        uint64 ts = uint64(block.timestamp);
        commit.revealed = true;
        commit.revealedAt = ts;

        _reveals[sessionId][reviewerPseudonym] = ReviewRevealRecord({
            exists: true,
            sessionId: sessionId,
            reviewerPseudonym: reviewerPseudonym,
            assignmentCommitment: assignmentCommitment,
            recommendation: recommendation,
            reviewHash: reviewHash,
            reviewURI: reviewURI,
            nonce: nonce,
            revealedAt: ts
        });
        emit ReviewRevealed(
            sessionId,
            reviewerPseudonym,
            assignmentCommitment,
            recommendation,
            reviewHash,
            reviewURI,
            ts
        );
    }

    function admin() external view override returns (address) {
        return _admin;
    }
    function isSessionManager(address addr) external view override returns (bool) {
        return _sessionManagers[addr];
    }
    function getReviewPhase(bytes32 sessionId) external view override returns (ReviewPhase) {
        return _phases[sessionId];
    }
    function hasCommit(bytes32 sessionId, address reviewer) external view override returns (bool) {
        return _commits[sessionId][reviewer].exists;
    }
    function hasReveal(bytes32 sessionId, address reviewer) external view override returns (bool) {
        return _reveals[sessionId][reviewer].exists;
    }

    function getCommitRecord(
        bytes32 sessionId,
        address reviewer
    ) external view override returns (ReviewCommitRecord memory) {
        ReviewCommitRecord memory r = _commits[sessionId][reviewer];
        if (!r.exists) revert CommitNotFound();
        return r;
    }

    function getRevealRecord(
        bytes32 sessionId,
        address reviewer
    ) external view override returns (ReviewRevealRecord memory) {
        ReviewRevealRecord memory r = _reveals[sessionId][reviewer];
        if (!r.exists) revert CommitNotFound();
        return r;
    }

    function computeCommitHash(
        bytes32 sessionId,
        address reviewerPseudonym,
        ReviewRecommendation recommendation,
        bytes32 reviewHash,
        string calldata reviewURI,
        bytes32 nonce
    ) external pure override returns (bytes32) {
        if (sessionId == bytes32(0)) revert InvalidSessionId();
        if (reviewerPseudonym == address(0)) revert InvalidPseudonym();
        if (recommendation == ReviewRecommendation.None) revert InvalidRecommendation();
        if (reviewHash == bytes32(0)) revert InvalidHash();
        return
            keccak256(
                abi.encode(
                    sessionId,
                    reviewerPseudonym,
                    recommendation,
                    reviewHash,
                    reviewURI,
                    nonce
                )
            );
    }
}
