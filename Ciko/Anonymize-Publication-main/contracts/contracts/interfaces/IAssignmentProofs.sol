// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IAssignmentProofs {
    struct EditorAssignmentProof {
        bool exists;
        bytes32 sessionId;
        address editorPseudonym;
        bytes32 proofRef;
        uint64 recordedAt;
    }
    struct ReviewerAssignmentProof {
        bool exists;
        bytes32 sessionId;
        bytes32 reviewerAssignmentCommitment;
        bytes32 inviteRef;
        bytes32 proofRef;
        uint64 recordedAt;
    }

    event SessionManagerUpdated(address indexed manager, bool authorized, uint64 timestamp);

    event EditorAssignmentProofRecorded(
        bytes32 indexed sessionId,
        address indexed editorPseudonym,
        bytes32 proofRef,
        uint64 timestamp
    );

    event ReviewerAssignmentProofRecorded(
        bytes32 indexed sessionId,
        bytes32 indexed reviewerAssignmentCommitment,
        bytes32 inviteRef,
        bytes32 proofRef,
        uint64 timestamp
    );

    error OnlyAdmin();
    error OnlySessionManager();
    error SessionNotFound();
    error InvalidSessionId();
    error InvalidPseudonym();
    error InvalidCommitment();
    error InvalidReference();
    error UnauthorizedRole();
    error ProofAlreadyExists();
    error ProofNotFound();
    error EditorMismatch();
    error EditorAlreadyRecorded();
    error InvalidSessionStatus();
    error LengthMismatch();

    function setSessionManager(address manager, bool authorized) external;

    function recordEditorAssignmentProof(
        bytes32 sessionId,
        address editorPseudonym,
        bytes32 proofRef
    ) external;

    function recordReviewerAssignmentProof(
        bytes32 sessionId,
        bytes32 reviewerAssignmentCommitment,
        bytes32 inviteRef,
        bytes32 proofRef
    ) external;

    function batchRecordReviewerAssignmentProofs(
        bytes32 sessionId,
        bytes32[] calldata reviewerAssignmentCommitments,
        bytes32[] calldata inviteRefs,
        bytes32[] calldata proofRefs
    ) external;

    function admin() external view returns (address);

    function isSessionManager(address addr) external view returns (bool);

    function hasEditorAssignmentProof(bytes32 sessionId) external view returns (bool);

    function hasReviewerAssignmentProof(
        bytes32 sessionId,
        bytes32 reviewerAssignmentCommitment
    ) external view returns (bool);

    function getEditorAssignmentProof(
        bytes32 sessionId
    ) external view returns (EditorAssignmentProof memory);

    function getReviewerAssignmentProof(
        bytes32 sessionId,
        bytes32 reviewerAssignmentCommitment
    ) external view returns (ReviewerAssignmentProof memory);

    function getReviewerAssignmentProofCount(bytes32 sessionId) external view returns (uint256);
}
