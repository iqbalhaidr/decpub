// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "../ciko/interfaces/IEphemeralAccounts.sol";
import "../ciko/interfaces/IPublicationSessions.sol";
import "../ciko/interfaces/IAutomaticChecks.sol";
import "../ciko/interfaces/IEditorialScreenings.sol";
import "../ciko/interfaces/IAssignmentProofs.sol";
import "../ciko/interfaces/IReviewerSelections.sol";
import "../ciko/interfaces/IReviewSubmissions.sol";
import "../ciko/interfaces/IReviewDecisions.sol";
import "../zk/IZkVerifier.sol";

/**
 * ActionGateway: satu-satunya session manager di kontrak Ciko (docs/arsitektur.md bagian 8.1).
 *
 * Server menjadi `operator` gateway, bukan session manager kontrak Ciko, sehingga server
 * tidak bisa memalsukan aksi pihak lain. Tiga jenis aksi:
 *
 *  1. Bertanda tangan pseudonim (EIP-712, relayer membayar gas): pembuatan sesi, revisi,
 *     putusan editorial, commit dan reveal telaah. Gateway memeriksa tanda tangan, nonce
 *     per pseudonim, dan (untuk telaah) ikatan commitment penugasan ke pseudonim.
 *  2. Ber-ZK: pembuatan pseudonim dan pengikatan penugasan. Gateway memeriksa bukti lewat
 *     `IZkVerifier` dan mencatat nullifier agar bukti tidak bisa dipakai ulang.
 *  3. Sistem (hanya operator): `passthrough` ke kontrak Ciko untuk langkah yang memang
 *     diputuskan sistem (status, penugasan, seleksi, fase telaah, keputusan).
 *
 * Penutup celah Ciko: `ReviewSubmissions` tidak mengikat `assignmentCommitment` ke satu
 * pseudonim (ReviewSubmissions.sol:97). Gateway menambahkannya lewat `bindAssignment`.
 *
 * Kontrak Ciko tidak diubah kecuali `EphemeralAccounts` (lihat catatan di berkasnya).
 */
contract ActionGateway is EIP712 {
    // ------------------------------------------------------------------ tipe

    struct CreateSessionAction {
        bytes32 sessionId;
        address pseudonym;
        bytes32 originalManuscriptHash;
        bytes32 anonymizedManuscriptHash;
        bytes32 metadataHash;
        string anonymizedManuscriptURI;
        string metadataURI;
        uint256 nonce;
    }

    struct RevisionAction {
        bytes32 sessionId;
        address pseudonym;
        bytes32 newOriginalManuscriptHash;
        bytes32 newAnonymizedManuscriptHash;
        bytes32 newMetadataHash;
        string newAnonymizedManuscriptURI;
        string newMetadataURI;
        uint256 nonce;
    }

    struct ScreeningAction {
        bytes32 sessionId;
        address pseudonym;
        bytes32 editorialReportHash;
        bytes32 anonymousEditorialReportHash;
        string anonymousEditorialReportURI;
        uint8 decision;
        uint256 nonce;
    }

    struct CommitAction {
        bytes32 sessionId;
        address pseudonym;
        bytes32 assignmentCommitment;
        bytes32 commitHash;
        uint256 nonce;
    }

    struct RevealAction {
        bytes32 sessionId;
        address pseudonym;
        bytes32 assignmentCommitment;
        uint8 recommendation;
        bytes32 reviewHash;
        string reviewURI;
        bytes32 reviewNonce;
        uint256 nonce;
    }

    // ------------------------------------------------------------- typehash
    // Harus sama persis dengan `ACTION_TYPES` di `@decpub/shared`.

    bytes32 public constant CREATE_SESSION_TYPEHASH =
        keccak256(
            "CreateSession(bytes32 sessionId,address pseudonym,bytes32 originalManuscriptHash,bytes32 anonymizedManuscriptHash,bytes32 metadataHash,string anonymizedManuscriptURI,string metadataURI,uint256 nonce)"
        );
    bytes32 public constant REVISION_TYPEHASH =
        keccak256(
            "RecordRevision(bytes32 sessionId,address pseudonym,bytes32 newOriginalManuscriptHash,bytes32 newAnonymizedManuscriptHash,bytes32 newMetadataHash,string newAnonymizedManuscriptURI,string newMetadataURI,uint256 nonce)"
        );
    bytes32 public constant SCREENING_TYPEHASH =
        keccak256(
            "Screening(bytes32 sessionId,address pseudonym,bytes32 editorialReportHash,bytes32 anonymousEditorialReportHash,string anonymousEditorialReportURI,uint8 decision,uint256 nonce)"
        );
    bytes32 public constant COMMIT_TYPEHASH =
        keccak256(
            "CommitReview(bytes32 sessionId,address pseudonym,bytes32 assignmentCommitment,bytes32 commitHash,uint256 nonce)"
        );
    bytes32 public constant REVEAL_TYPEHASH =
        keccak256(
            "RevealReview(bytes32 sessionId,address pseudonym,bytes32 assignmentCommitment,uint8 recommendation,bytes32 reviewHash,string reviewURI,bytes32 reviewNonce,uint256 nonce)"
        );

    // ---------------------------------------------------------------- state

    address public admin;
    address public operator;
    IZkVerifier public verifier;

    IEphemeralAccounts public immutable ephemeralAccounts;
    IPublicationSessions public immutable publicationSessions;
    IAutomaticChecks public immutable automaticChecks;
    IEditorialScreenings public immutable editorialScreenings;
    IAssignmentProofs public immutable assignmentProofs;
    IReviewerSelections public immutable reviewerSelections;
    IReviewSubmissions public immutable reviewSubmissions;
    IReviewDecisions public immutable reviewDecisions;

    /// Nonce aksi bertanda tangan, per pseudonim.
    mapping(address => uint256) public nonces;
    /// Nullifier yang sudah dipakai (satu pseudonim per orang per sesi, peran, dan slot).
    mapping(bytes32 => bool) public nullifierUsed;
    /// sessionId => assignmentCommitment => pseudonim pemilik penugasan.
    mapping(bytes32 => mapping(bytes32 => address)) public assignmentOwner;

    // --------------------------------------------------------------- events

    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event VerifierUpdated(address indexed previousVerifier, address indexed newVerifier);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event NullifierConsumed(uint8 indexed kind, bytes32 indexed nullifier);
    event AssignmentBound(
        bytes32 indexed sessionId,
        bytes32 indexed assignmentCommitment,
        address indexed pseudonym
    );

    // --------------------------------------------------------------- errors

    error OnlyAdmin();
    error OnlyOperator();
    error InvalidAddress();
    error InvalidProof();
    error NullifierAlreadyUsed();
    error InvalidSignature();
    error InvalidNonce();
    error NotSessionAuthor();
    error AssignmentNotRecorded();
    error AssignmentAlreadyBound();
    error AssignmentNotOwnedByPseudonym();
    error UnauthorizedRole();
    error InvalidSession();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert OnlyOperator();
        _;
    }

    /// Alamat 8 kontrak Ciko dikirim sebagai larik dengan urutan tetap:
    /// [ephemeralAccounts, publicationSessions, automaticChecks, editorialScreenings,
    ///  assignmentProofs, reviewerSelections, reviewSubmissions, reviewDecisions].
    constructor(
        address[8] memory cikoContracts,
        address verifier_,
        address operator_
    ) EIP712("DecPubActionGateway", "1") {
        for (uint256 i; i < 8; ++i) {
            if (cikoContracts[i] == address(0)) revert InvalidAddress();
        }
        if (verifier_ == address(0) || operator_ == address(0)) revert InvalidAddress();
        admin = msg.sender;
        operator = operator_;
        verifier = IZkVerifier(verifier_);
        ephemeralAccounts = IEphemeralAccounts(cikoContracts[0]);
        publicationSessions = IPublicationSessions(cikoContracts[1]);
        automaticChecks = IAutomaticChecks(cikoContracts[2]);
        editorialScreenings = IEditorialScreenings(cikoContracts[3]);
        assignmentProofs = IAssignmentProofs(cikoContracts[4]);
        reviewerSelections = IReviewerSelections(cikoContracts[5]);
        reviewSubmissions = IReviewSubmissions(cikoContracts[6]);
        reviewDecisions = IReviewDecisions(cikoContracts[7]);
    }

    // ---------------------------------------------------------------- admin

    function setVerifier(address newVerifier) external onlyAdmin {
        if (newVerifier == address(0)) revert InvalidAddress();
        emit VerifierUpdated(address(verifier), newVerifier);
        verifier = IZkVerifier(newVerifier);
    }

    function setOperator(address newOperator) external onlyAdmin {
        if (newOperator == address(0)) revert InvalidAddress();
        emit OperatorUpdated(operator, newOperator);
        operator = newOperator;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert InvalidAddress();
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    // ------------------------------------------------------- aksi ber-ZK

    /**
     * Membuat pseudonim dengan bukti `Kind.Ephemeral`. Boleh dikirim siapa saja (relayer):
     * bukti mengikat semua parameter, jadi pengirim tidak bisa mengubah apa pun.
     *
     * Sinyal publik: [sessionId, role, pseudonym, sessionCommitment, nullifier].
     * Tidak ada commitment identitas permanen di sini maupun di event kontrak Ciko.
     */
    function createEphemeralWithProof(
        bytes32 sessionId,
        IEphemeralAccounts.Role role,
        address pseudonym,
        bytes32 sessionCommitment,
        bytes32 nullifier,
        bytes calldata proof
    ) external {
        if (nullifierUsed[nullifier]) revert NullifierAlreadyUsed();

        bytes32[] memory signals = new bytes32[](5);
        signals[0] = sessionId;
        signals[1] = bytes32(uint256(uint8(role)));
        signals[2] = bytes32(uint256(uint160(pseudonym)));
        signals[3] = sessionCommitment;
        signals[4] = nullifier;
        _verify(IZkVerifier.Kind.Ephemeral, signals, proof);

        nullifierUsed[nullifier] = true;
        emit NullifierConsumed(uint8(IZkVerifier.Kind.Ephemeral), nullifier);
        ephemeralAccounts.createEphemeral(pseudonym, sessionId, role, sessionCommitment);
    }

    /**
     * Mengikat commitment penugasan penelaah ke satu pseudonim (`Kind.AssignmentOwnership`).
     * Hanya pemegang undangan (tahu salt) yang bisa membuat bukti ini.
     *
     * Sinyal publik: [sessionId, assignmentCommitment, pseudonym].
     */
    function bindAssignment(
        bytes32 sessionId,
        bytes32 assignmentCommitment,
        address pseudonym,
        bytes calldata proof
    ) external {
        if (assignmentOwner[sessionId][assignmentCommitment] != address(0))
            revert AssignmentAlreadyBound();
        if (!assignmentProofs.hasReviewerAssignmentProof(sessionId, assignmentCommitment))
            revert AssignmentNotRecorded();

        IEphemeralAccounts.EphemeralAccount memory acc = ephemeralAccounts.getAccount(pseudonym);
        if (!ephemeralAccounts.isActive(pseudonym)) revert InvalidSession();
        if (acc.role != IEphemeralAccounts.Role.Reviewer) revert UnauthorizedRole();
        if (acc.sessionId != sessionId) revert InvalidSession();

        bytes32[] memory signals = new bytes32[](3);
        signals[0] = sessionId;
        signals[1] = assignmentCommitment;
        signals[2] = bytes32(uint256(uint160(pseudonym)));
        _verify(IZkVerifier.Kind.AssignmentOwnership, signals, proof);

        assignmentOwner[sessionId][assignmentCommitment] = pseudonym;
        emit AssignmentBound(sessionId, assignmentCommitment, pseudonym);
    }

    // -------------------------------------------- aksi bertanda tangan pseudonim

    function createSessionSigned(CreateSessionAction calldata a, bytes calldata signature) external {
        _consume(a.pseudonym, a.nonce, _hashCreateSession(a), signature);
        publicationSessions.createSession(
            a.sessionId,
            a.pseudonym,
            a.originalManuscriptHash,
            a.anonymizedManuscriptHash,
            a.metadataHash,
            a.anonymizedManuscriptURI,
            a.metadataURI
        );
    }

    /// Hanya penulis sesi (pseudonim Author) yang boleh merevisi.
    function recordRevisionSigned(RevisionAction calldata a, bytes calldata signature) external {
        if (publicationSessions.getSession(a.sessionId).authorPseudonym != a.pseudonym)
            revert NotSessionAuthor();
        _consume(a.pseudonym, a.nonce, _hashRevision(a), signature);
        publicationSessions.recordRevision(
            a.sessionId,
            a.newOriginalManuscriptHash,
            a.newAnonymizedManuscriptHash,
            a.newMetadataHash,
            a.newAnonymizedManuscriptURI,
            a.newMetadataURI
        );
    }

    /// Kontrak Ciko memeriksa bahwa pseudonim adalah editor sesi.
    function screeningSigned(
        ScreeningAction calldata a,
        bytes calldata signature
    ) external returns (uint32 revision) {
        _consume(a.pseudonym, a.nonce, _hashScreening(a), signature);
        revision = editorialScreenings.recordEditorialScreening(
            a.sessionId,
            a.pseudonym,
            a.editorialReportHash,
            a.anonymousEditorialReportHash,
            a.anonymousEditorialReportURI,
            IEditorialScreenings.DeskReviewDecision(a.decision)
        );
    }

    function commitReviewSigned(CommitAction calldata a, bytes calldata signature) external {
        if (assignmentOwner[a.sessionId][a.assignmentCommitment] != a.pseudonym)
            revert AssignmentNotOwnedByPseudonym();
        _consume(a.pseudonym, a.nonce, _hashCommit(a), signature);
        reviewSubmissions.commitReview(
            a.sessionId,
            a.pseudonym,
            a.assignmentCommitment,
            a.commitHash
        );
    }

    function revealReviewSigned(RevealAction calldata a, bytes calldata signature) external {
        if (assignmentOwner[a.sessionId][a.assignmentCommitment] != a.pseudonym)
            revert AssignmentNotOwnedByPseudonym();
        _consume(a.pseudonym, a.nonce, _hashReveal(a), signature);
        reviewSubmissions.revealReview(
            a.sessionId,
            a.pseudonym,
            a.assignmentCommitment,
            IReviewSubmissions.ReviewRecommendation(a.recommendation),
            a.reviewHash,
            a.reviewURI,
            a.reviewNonce
        );
    }

    // ------------------------------------------------ aksi sistem (operator)

    function updateStatus(
        bytes32 sessionId,
        IPublicationSessions.PublicationStatus newStatus
    ) external onlyOperator {
        publicationSessions.updateStatus(sessionId, newStatus);
    }

    function assignEditor(bytes32 sessionId, address editorPseudonym) external onlyOperator {
        publicationSessions.assignEditor(sessionId, editorPseudonym);
    }

    function recordReviewerCriteria(
        bytes32 sessionId,
        bytes32 criteriaHash,
        uint16 reviewerCount
    ) external onlyOperator {
        publicationSessions.recordReviewerCriteria(sessionId, criteriaHash, reviewerCount);
    }

    function recordAutomaticCheck(
        bytes32 sessionId,
        bytes32 reportHash,
        bytes32 flagsHash,
        string calldata reportURI,
        IAutomaticChecks.AutomaticCheckResult result
    ) external onlyOperator returns (uint32) {
        return automaticChecks.recordAutomaticCheck(sessionId, reportHash, flagsHash, reportURI, result);
    }

    function recordEditorAssignmentProof(
        bytes32 sessionId,
        address editorPseudonym,
        bytes32 proofRef
    ) external onlyOperator {
        assignmentProofs.recordEditorAssignmentProof(sessionId, editorPseudonym, proofRef);
    }

    function recordReviewerAssignmentProof(
        bytes32 sessionId,
        bytes32 reviewerAssignmentCommitment,
        bytes32 inviteRef,
        bytes32 proofRef
    ) external onlyOperator {
        assignmentProofs.recordReviewerAssignmentProof(
            sessionId,
            reviewerAssignmentCommitment,
            inviteRef,
            proofRef
        );
    }

    function batchRecordReviewerAssignmentProofs(
        bytes32 sessionId,
        bytes32[] calldata reviewerAssignmentCommitments,
        bytes32[] calldata inviteRefs,
        bytes32[] calldata proofRefs
    ) external onlyOperator {
        assignmentProofs.batchRecordReviewerAssignmentProofs(
            sessionId,
            reviewerAssignmentCommitments,
            inviteRefs,
            proofRefs
        );
    }

    function recordSelectionBatch(
        bytes32 sessionId,
        bytes32 criteriaHash,
        uint16 reviewerCount,
        bytes32[] calldata reviewerAssignmentCommitments
    ) external onlyOperator returns (uint32) {
        return
            reviewerSelections.recordSelectionBatch(
                sessionId,
                criteriaHash,
                reviewerCount,
                reviewerAssignmentCommitments
            );
    }

    function setReviewPhase(
        bytes32 sessionId,
        IReviewSubmissions.ReviewPhase newPhase
    ) external onlyOperator {
        reviewSubmissions.setReviewPhase(sessionId, newPhase);
    }

    function decideBatch(
        bytes32 sessionId,
        uint32 batch,
        address[] calldata reviewerPseudonyms,
        uint16 additionalReviewerCountIfGrayZone
    ) external onlyOperator {
        reviewDecisions.decideBatch(
            sessionId,
            batch,
            reviewerPseudonyms,
            additionalReviewerCountIfGrayZone
        );
    }

    // ---------------------------------------------------------------- views

    // Pemisah domain EIP-712. Dipakai tes untuk membandingkan
    // dengan hasil `@decpub/shared`.
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ------------------------------------------------------------- internal

    function _verify(
        IZkVerifier.Kind kind,
        bytes32[] memory signals,
        bytes calldata proof
    ) internal view {
        if (!verifier.verify(uint8(kind), signals, proof)) revert InvalidProof();
    }

    /// Memeriksa tanda tangan dan nonce, lalu menaikkan nonce.
    function _consume(
        address pseudonym,
        uint256 nonce,
        bytes32 structHash,
        bytes calldata signature
    ) internal {
        address signer = ECDSA.recover(_hashTypedDataV4(structHash), signature);
        if (signer != pseudonym || pseudonym == address(0)) revert InvalidSignature();
        if (nonce != nonces[pseudonym]) revert InvalidNonce();
        nonces[pseudonym] = nonce + 1;
    }

    function _hashCreateSession(CreateSessionAction calldata a) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    CREATE_SESSION_TYPEHASH,
                    a.sessionId,
                    a.pseudonym,
                    a.originalManuscriptHash,
                    a.anonymizedManuscriptHash,
                    a.metadataHash,
                    keccak256(bytes(a.anonymizedManuscriptURI)),
                    keccak256(bytes(a.metadataURI)),
                    a.nonce
                )
            );
    }

    function _hashRevision(RevisionAction calldata a) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    REVISION_TYPEHASH,
                    a.sessionId,
                    a.pseudonym,
                    a.newOriginalManuscriptHash,
                    a.newAnonymizedManuscriptHash,
                    a.newMetadataHash,
                    keccak256(bytes(a.newAnonymizedManuscriptURI)),
                    keccak256(bytes(a.newMetadataURI)),
                    a.nonce
                )
            );
    }

    function _hashScreening(ScreeningAction calldata a) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    SCREENING_TYPEHASH,
                    a.sessionId,
                    a.pseudonym,
                    a.editorialReportHash,
                    a.anonymousEditorialReportHash,
                    keccak256(bytes(a.anonymousEditorialReportURI)),
                    a.decision,
                    a.nonce
                )
            );
    }

    function _hashCommit(CommitAction calldata a) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    COMMIT_TYPEHASH,
                    a.sessionId,
                    a.pseudonym,
                    a.assignmentCommitment,
                    a.commitHash,
                    a.nonce
                )
            );
    }

    function _hashReveal(RevealAction calldata a) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    REVEAL_TYPEHASH,
                    a.sessionId,
                    a.pseudonym,
                    a.assignmentCommitment,
                    a.recommendation,
                    a.reviewHash,
                    keccak256(bytes(a.reviewURI)),
                    a.reviewNonce,
                    a.nonce
                )
            );
    }
}
