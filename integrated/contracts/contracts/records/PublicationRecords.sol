// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "../ciko/interfaces/IPublicationSessions.sol";
import "../zk/IZkVerifier.sol";
import "../zk/IVerifierSource.sol";
import "../roihan/DOILib.sol";

interface IDOIMinter {
    function mint(address to, string memory tokenURI_) external returns (uint256 tokenId);
}

/**
 * PublicationRecords: catatan pasca-publikasi (P08), kontrak baru (docs/arsitektur.md bagian 9).
 * Menggantikan peran `PublicationRegistry` Roihan yang dibuang, TANPA mengubah `PublicationSessions`:
 *
 *  - `recordFinal`      saat sesi `Published`: menerbitkan DOI (NFT `DOIToken`) dan menyimpan rujukan final
 *                       (hash dan URI versi anonim, hash naskah asli). Nama penulis tidak ada di sini.
 *  - `recordDisclosure` selective disclosure atas pilihan penulis (B2): menautkan pseudonim Author ke akun
 *                       permanen lewat bukti `SELECTIVE_DISCLOSURE` dan mencatat hash atribut yang dibuka.
 *                       Berlaku juga untuk editor (opsional). Penelaah TIDAK PERNAH bisa diungkap:
 *                       fungsi ini hanya menerima peran Author dan Editor, dan pseudonim diambil dari sesi.
 *
 * DOI NFT dimiliki kontrak ini, bukan akun penulis: memint ke akun permanen penulis akan menautkannya
 * ke naskah sebelum ia memilih mengungkap diri.
 *
 * Yang TIDAK diperiksa kontrak: kebenaran atribut dan isi berkas asli. Server (tepercaya untuk ini)
 * mencocokkannya dengan penyimpanan privat sebelum mengirim `recordDisclosure`; kontrak hanya mencatat
 * hash atribut yang terikat bukti, hash naskah asli dari sesi, dan URI berkas yang dibuka.
 * Karena itu kedua fungsi hanya bisa dipanggil operator.
 */
contract PublicationRecords is IERC721Receiver {
    struct FinalRecord {
        bool exists;
        uint256 doiTokenId;
        string doi;
        bytes32 originalManuscriptHash;
        bytes32 anonymizedManuscriptHash;
        bytes32 metadataHash;
        string anonymizedManuscriptURI;
        string metadataURI;
        uint32 revisionCount;
        uint64 publishedAt;
    }

    struct Disclosure {
        bool exists;
        address pseudonym;
        address permanentAccount;
        bytes32 attributesHash;
        /// Kosong bila hanya identitas yang dibuka (selalu kosong untuk editor).
        string originalManuscriptURI;
        uint64 disclosedAt;
    }

    address public admin;
    address public operator;

    IPublicationSessions public immutable publicationSessions;
    IDOIMinter public immutable doiToken;
    IVerifierSource public immutable verifierSource;

    mapping(bytes32 => FinalRecord) private _finals;
    /// sessionId => peran (0 Author, 2 Editor) => pengungkapan.
    mapping(bytes32 => mapping(uint8 => Disclosure)) private _disclosures;
    /// Urutan penerbitan; nomor urut + 1 menjadi `msId` di DOI.
    bytes32[] private _recordedSessions;

    event OperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event AdminTransferred(address indexed previousAdmin, address indexed newAdmin);
    event FinalRecorded(
        bytes32 indexed sessionId,
        uint256 indexed doiTokenId,
        string doi,
        bytes32 originalManuscriptHash,
        bytes32 anonymizedManuscriptHash,
        uint64 publishedAt
    );
    event DisclosureRecorded(
        bytes32 indexed sessionId,
        uint8 indexed role,
        address indexed pseudonym,
        address permanentAccount,
        bytes32 attributesHash,
        bytes32 originalManuscriptHash,
        string originalManuscriptURI
    );

    error OnlyAdmin();
    error OnlyOperator();
    error InvalidAddress();
    error SessionNotPublished();
    error AlreadyRecorded();
    error NotRecorded();
    error RoleNotDisclosable();
    error NoPseudonym();
    error AlreadyDisclosed();
    error ManuscriptOnlyForAuthor();
    error InvalidProof();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator) revert OnlyOperator();
        _;
    }

    constructor(address publicationSessions_, address doiToken_, address verifierSource_, address operator_) {
        if (
            publicationSessions_ == address(0) ||
            doiToken_ == address(0) ||
            verifierSource_ == address(0) ||
            operator_ == address(0)
        ) revert InvalidAddress();
        admin = msg.sender;
        operator = operator_;
        publicationSessions = IPublicationSessions(publicationSessions_);
        doiToken = IDOIMinter(doiToken_);
        verifierSource = IVerifierSource(verifierSource_);
    }

    // ---------------------------------------------------------------- admin

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

    // ---------------------------------------------------------- penerbitan

    /// Menerbitkan DOI untuk sesi yang sudah `Published`. Sekali per sesi.
    function recordFinal(bytes32 sessionId) external onlyOperator returns (uint256 doiTokenId, string memory doi) {
        IPublicationSessions.PublicationSession memory s = publicationSessions.getSession(sessionId);
        if (!s.exists || s.status != IPublicationSessions.PublicationStatus.Published) revert SessionNotPublished();
        FinalRecord storage f = _finals[sessionId];
        if (f.exists) revert AlreadyRecorded();

        _recordedSessions.push(sessionId);
        // msId = nomor urut penerbitan (mulai 1), versi = revisi + 1.
        doi = DOILib.buildDOI(_recordedSessions.length, uint256(s.revisionCount) + 1);
        // tokenURI = metadata publik (anonim) di storage; tidak memuat nama penulis.
        doiTokenId = doiToken.mint(address(this), s.metadataURI);

        f.exists = true;
        f.doiTokenId = doiTokenId;
        f.doi = doi;
        f.originalManuscriptHash = s.originalManuscriptHash;
        f.anonymizedManuscriptHash = s.anonymizedManuscriptHash;
        f.metadataHash = s.metadataHash;
        f.anonymizedManuscriptURI = s.anonymizedManuscriptURI;
        f.metadataURI = s.metadataURI;
        f.revisionCount = s.revisionCount;
        f.publishedAt = uint64(block.timestamp);

        emit FinalRecorded(sessionId, doiTokenId, doi, s.originalManuscriptHash, s.anonymizedManuscriptHash, f.publishedAt);
    }

    // --------------------------------------------------------- pengungkapan

    /**
     * Mencatat selective disclosure. Sinyal publik bukti: [sessionId, pseudonym, permanentAccount, attributesHash].
     * Pseudonim TIDAK diberikan pemanggil: diambil dari sesi menurut `role`, sehingga pseudonim penelaah
     * tidak pernah bisa dimasukkan.
     *
     * @param role 0 = Author, 2 = Editor. Peran lain ditolak.
     * @param originalManuscriptURI URI naskah asli yang dibuka (hanya Author; boleh kosong). Hash-nya sudah
     *        tercatat di sesi (`originalManuscriptHash`) dan diperiksa server sebelum URI ini dikirim.
     */
    function recordDisclosure(
        bytes32 sessionId,
        uint8 role,
        address permanentAccount,
        bytes32 attributesHash,
        string calldata originalManuscriptURI,
        bytes calldata proof
    ) external onlyOperator {
        FinalRecord storage f = _finals[sessionId];
        if (!f.exists) revert NotRecorded();
        if (role != 0 && role != 2) revert RoleNotDisclosable();
        if (role == 2 && bytes(originalManuscriptURI).length != 0) revert ManuscriptOnlyForAuthor();
        if (permanentAccount == address(0)) revert InvalidAddress();
        if (_disclosures[sessionId][role].exists) revert AlreadyDisclosed();

        IPublicationSessions.PublicationSession memory s = publicationSessions.getSession(sessionId);
        address pseudonym = role == 0 ? s.authorPseudonym : s.editorPseudonym;
        if (pseudonym == address(0)) revert NoPseudonym();

        bytes32[] memory signals = new bytes32[](4);
        signals[0] = sessionId;
        signals[1] = bytes32(uint256(uint160(pseudonym)));
        signals[2] = bytes32(uint256(uint160(permanentAccount)));
        signals[3] = attributesHash;
        if (!IZkVerifier(verifierSource.verifier()).verify(uint8(IZkVerifier.Kind.SelectiveDisclosure), signals, proof))
            revert InvalidProof();

        Disclosure storage d = _disclosures[sessionId][role];
        d.exists = true;
        d.pseudonym = pseudonym;
        d.permanentAccount = permanentAccount;
        d.attributesHash = attributesHash;
        d.originalManuscriptURI = originalManuscriptURI;
        d.disclosedAt = uint64(block.timestamp);

        emit DisclosureRecorded(
            sessionId, role, pseudonym, permanentAccount, attributesHash, f.originalManuscriptHash, originalManuscriptURI
        );
    }

    // ----------------------------------------------------------------- baca

    function getFinal(bytes32 sessionId) external view returns (FinalRecord memory) {
        return _finals[sessionId];
    }

    function hasFinal(bytes32 sessionId) external view returns (bool) {
        return _finals[sessionId].exists;
    }

    function getDisclosure(bytes32 sessionId, uint8 role) external view returns (Disclosure memory) {
        return _disclosures[sessionId][role];
    }

    function recordedSessionCount() external view returns (uint256) {
        return _recordedSessions.length;
    }

    function recordedSessionAt(uint256 index) external view returns (bytes32) {
        return _recordedSessions[index];
    }

    /// Kontrak ini menerima DOI NFT yang dimint untuknya (`_safeMint`).
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}
