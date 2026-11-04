// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/IReviewDecisions.sol";
import "./interfaces/IPublicationSessions.sol";
import "./interfaces/IReviewSubmissions.sol";

contract ReviewDecisions is IReviewDecisions {
    struct VoteTally {
        uint16 rejectCount;
        uint16 majorRevisionCount;
        uint16 minorRevisionCount;
        uint16 acceptAsIsCount;
    }

    address private _admin;
    IPublicationSessions private immutable _publicationSessions;
    IReviewSubmissions private immutable _reviewSubmissions;

    mapping(address => bool) private _sessionManagers;
    mapping(bytes32 => mapping(uint32 => DecisionBatch)) private _decisions;

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

    constructor(address publicationSessionsAddr, address reviewSubmissionsAddr) {
        _admin = msg.sender;
        _publicationSessions = IPublicationSessions(publicationSessionsAddr);
        _reviewSubmissions = IReviewSubmissions(reviewSubmissionsAddr);
    }

    function setSessionManager(address manager, bool authorized) external override onlyAdmin {
        _sessionManagers[manager] = authorized;
        emit SessionManagerUpdated(manager, authorized, uint64(block.timestamp));
    }

    function decideBatch(
        bytes32 sessionId,
        uint32 batch,
        address[] calldata reviewerPseudonyms,
        uint16 additionalReviewerCountIfGrayZone
    ) external override onlySessionManager sessionMustExist(sessionId) {
        if (batch == 0) revert InvalidBatch();
        if (reviewerPseudonyms.length == 0) revert InvalidReviewerCount();
        if (_decisions[sessionId][batch].exists) revert BatchAlreadyDecided();

        IPublicationSessions.PublicationStatus status = _publicationSessions
            .getSession(sessionId)
            .status;
        if (status != IPublicationSessions.PublicationStatus.UnderReview)
            revert InvalidSessionStatus();

        VoteTally memory tally = _collectVotes(sessionId, reviewerPseudonyms);
        (bool grayZone, DecisionOutcome outcome) = _computeOutcome(
            tally.rejectCount,
            tally.majorRevisionCount,
            tally.minorRevisionCount,
            tally.acceptAsIsCount
        );

        uint16 additionalCount = grayZone ? additionalReviewerCountIfGrayZone : 0;
        if (grayZone) outcome = DecisionOutcome.None;

        uint64 ts = uint64(block.timestamp);
        _decisions[sessionId][batch] = DecisionBatch({
            exists: true,
            sessionId: sessionId,
            batch: batch,
            reviewerCount: uint16(reviewerPseudonyms.length),
            rejectCount: tally.rejectCount,
            majorRevisionCount: tally.majorRevisionCount,
            minorRevisionCount: tally.minorRevisionCount,
            acceptAsIsCount: tally.acceptAsIsCount,
            grayZone: grayZone,
            additionalReviewerCount: additionalCount,
            outcome: outcome,
            decidedAt: ts
        });

        emit ReviewBatchDecided(
            sessionId,
            batch,
            uint16(reviewerPseudonyms.length),
            tally.rejectCount,
            tally.majorRevisionCount,
            tally.minorRevisionCount,
            tally.acceptAsIsCount,
            grayZone,
            additionalCount,
            outcome,
            ts
        );

        if (!grayZone) {
            if (outcome == DecisionOutcome.AcceptAsIs) {
                _publicationSessions.updateStatus(
                    sessionId,
                    IPublicationSessions.PublicationStatus.Accepted
                );
            } else if (outcome == DecisionOutcome.Reject) {
                _publicationSessions.updateStatus(
                    sessionId,
                    IPublicationSessions.PublicationStatus.Rejected
                );
            } else if (outcome == DecisionOutcome.MajorRevision) {
                _publicationSessions.updateStatus(
                    sessionId,
                    IPublicationSessions.PublicationStatus.MajorRevisionRequired
                );
            } else if (outcome == DecisionOutcome.MinorRevision) {
                _publicationSessions.updateStatus(
                    sessionId,
                    IPublicationSessions.PublicationStatus.MinorRevisionRequired
                );
            }
        } else {
            _publicationSessions.updateStatus(
                sessionId,
                IPublicationSessions.PublicationStatus.AssigningReviewers
            );
        }
    }

    function admin() external view override returns (address) {
        return _admin;
    }
    function isSessionManager(address addr) external view override returns (bool) {
        return _sessionManagers[addr];
    }
    function hasDecision(bytes32 sessionId, uint32 batch) external view override returns (bool) {
        return _decisions[sessionId][batch].exists;
    }

    function getDecision(
        bytes32 sessionId,
        uint32 batch
    ) external view override returns (DecisionBatch memory) {
        DecisionBatch memory d = _decisions[sessionId][batch];
        if (!d.exists) revert InvalidBatch();
        return d;
    }

    function computeOutcome(
        uint16 rejectCount,
        uint16 majorRevisionCount,
        uint16 minorRevisionCount,
        uint16 acceptAsIsCount
    ) external pure override returns (bool grayZone, DecisionOutcome outcome) {
        return
            _computeOutcome(rejectCount, majorRevisionCount, minorRevisionCount, acceptAsIsCount);
    }

    function _collectVotes(
        bytes32 sessionId,
        address[] calldata reviewers
    ) internal view returns (VoteTally memory tally) {
        uint256 length = reviewers.length;
        for (uint256 i; i < length; ) {
            address reviewer = reviewers[i];
            if (reviewer == address(0)) revert RevealNotFound();
            for (uint256 j = i + 1; j < length; ) {
                if (reviewer == reviewers[j]) revert DuplicateReviewer();
                unchecked {
                    ++j;
                }
            }
            IReviewSubmissions.ReviewRevealRecord memory reveal = _reviewSubmissions
                .getRevealRecord(sessionId, reviewer);
            if (!reveal.exists) revert RevealNotFound();
            IReviewSubmissions.ReviewRecommendation rec = reveal.recommendation;
            if (rec == IReviewSubmissions.ReviewRecommendation.Reject) tally.rejectCount += 1;
            else if (rec == IReviewSubmissions.ReviewRecommendation.MajorRevision)
                tally.majorRevisionCount += 1;
            else if (rec == IReviewSubmissions.ReviewRecommendation.MinorRevision)
                tally.minorRevisionCount += 1;
            else if (rec == IReviewSubmissions.ReviewRecommendation.AcceptAsIs)
                tally.acceptAsIsCount += 1;
            else revert InvalidOutcome();
            unchecked {
                ++i;
            }
        }
    }

    function _computeOutcome(
        uint16 rejectCount,
        uint16 majorRevisionCount,
        uint16 minorRevisionCount,
        uint16 acceptAsIsCount
    ) internal pure returns (bool grayZone, DecisionOutcome outcome) {
        uint16 total = rejectCount + majorRevisionCount + minorRevisionCount + acceptAsIsCount;
        if (total == 0) revert InvalidReviewerCount();

        uint16 majority = total / 2 + 1;

        if (rejectCount >= majority) return (false, DecisionOutcome.Reject);
        if (majorRevisionCount >= majority) return (false, DecisionOutcome.MajorRevision);
        if (minorRevisionCount >= majority) return (false, DecisionOutcome.MinorRevision);
        if (acceptAsIsCount >= majority) return (false, DecisionOutcome.AcceptAsIs);

        return (true, DecisionOutcome.None);
    }
}
