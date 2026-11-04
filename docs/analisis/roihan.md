# Analisis Codebase Roihan

> **Catatan.** Dokumen ini hasil baca statis laporan dan kode oleh subagent. Kodenya belum dijalankan. Bagian "keputusan yang perlu ditanyakan" dan usulan bertanda inferensi sudah dijawab atau digantikan: keputusan final ada di [`docs/arsitektur.md`](../arsitektur.md).

**Status verifikasi.** Dokumen ini hasil baca statis. Tidak ada install, deploy, build, docker, atau test yang dijalankan. Eksekusi yang dilakukan hanya `pdftotext`, `grep`/`find`/`wc`, `diff`, dan satu `node -e` untuk menghitung skor mock plagiarisme (bagian 8). Gambar di PDF tidak diperiksa secara visual, hanya teksnya.

**Konvensi rujukan**

| Tanda | Arti |
|---|---|
| `path:baris` tanpa awalan | Fakta kode, relatif terhadap `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/` |
| `[Ciko]/...` | Relatif terhadap `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/` |
| `[Hugo]/...` | Relatif terhadap `/home/ihaidar/Projects/DecPub-claude/Hugo/ojs-incentive-main/` |
| `hal. N` | Fakta laporan, nomor cetak `Roihan/TA_Roihan.pdf`. Halaman PDF = N + 13 |
| `PDF hal. N` | Halaman PDF `Ciko/TA_Ciko.pdf` |
| **Inferensi** | Kesimpulan saya, belum dibuktikan dengan menjalankan sistem |

Daftar path absolut berkas kunci ada di akhir bagian 11.

## 1. Tujuan

**Tujuan laporan (fakta laporan).** Menghasilkan rancangan framework publikasi ilmiah berbasis blockchain yang menyatukan submission, peer review, dan publishing dalam satu alur end-to-end. Integritas riwayat, keputusan editorial, dan distribusi insentif dapat diverifikasi independen, sementara anonimitas tetap terjaga tanpa seluruh proses bergantung pada trusted third party. Implementasi berfungsi sebagai pembuktian kelayakan (hal. 3).

**Definisi framework.** Aplikasi semi-lengkap yang dapat digunakan ulang dan dispesialisasikan, menurut Fayad dan Schmidt (hal. 2, 34-36). Metodologinya Design Science Research (hal. 4-5).

**Kebutuhan (hal. 25-26)**

| Kode | Isi ringkas |
|---|---|
| FR-01 | Pengajuan naskah tercatat di blockchain |
| FR-02 | Pemeriksaan awal otomatis, lalu penyaringan editor |
| FR-03 | Penunjukan penelaah otomatis |
| FR-04 | Laporan ulasan tercatat immutable |
| FR-05 | Keputusan terima, tolak, atau revisi secara otonom |
| FR-06 | Insentif token otomatis saat terbit |
| FR-07 | Berkas di IPFS, referensi di blockchain |
| FR-08 | Penulis dan penelaah saling tersembunyi, penulis dibuka setelah keputusan akhir, penelaah permanen tersembunyi |
| FR-09 | Verifikasi bidang keahlian penelaah oleh editor |
| FR-10 | Komentar pembaca pascaterbit |
| NFR-01 s.d. 04 | Transparansi, kekekalan, desentralisasi penyimpanan, kontrol akses |

**Batas lingkup yang disengaja (hal. 3-4, 60).** Suara mayoritas sederhana, token bernilai tetap, pemilihan penelaah acak berdasarkan bidang, tanpa audit keamanan dan uji beban (hal. 85).

**Relevansi untuk integrasi.** Laporan menyebut sendiri arah lanjutan yang persis merupakan isi kerja Ciko dan Hugo:
- Anonimitas dengan pseudonim ephemeral, commit-reveal, ZKP, dan triple-blind (hal. 47).
- Insentif QoS dengan BWM, ECWM, TOPSIS, sigmoid, ETH, dan SBT (hal. 48-49).

**Inferensi:** Secara konseptual Roihan memang menyediakan kerangka penuh dengan modul sederhana yang bisa diganti oleh Ciko dan Hugo. Ini sejalan dengan prioritas integrasi. Namun modul anonimitas dan insentifnya tertanam dalam `PublicationRegistry`, sehingga penggantiannya lebih dalam dari sekadar menukar komponen (bagian 10 dan 11).

## 2. Arsitektur

Lima subsistem menurut laporan: frontend, backend, oracle, smart contract, dan basis data off-chain, ditambah IPFS melalui Pinata (hal. 31-34).

```
Browser (Next.js, viem)
  |  REST + JWT (axios)                 |  baca RPC (nonces, saldo)
  |                                     |  tx MetaMask dan tx dompet sesi
  v                                     v
backend-go (Gin :3001)  --tx relayer--> PublicationRegistry (proxy UUPS)
  |  |  |                                 |        |            |
  |  |  +- eth_call / eth_getLogs ------->|        | mint       | transferFrom/transfer
  |  |     (chainquery, per request)      |        v            v
  |  |                                    |     DOIToken    JournalToken
  |  +-- pinFileToIPFS --> Pinata         |
  |                                       v
  | SQL                              ReviewOracle --event--> oracle (Node.js)
  v                                       ^                    |     |
PostgreSQL (:5433 di host)                +---- fulfill* ------+     |
  ^                                                                  |
  +-- backend <-- POST /internal/reviewer-sessions (X-Oracle-Secret) +

Browser --> https://ipfs.io/ipfs/<cid>  (unduh berkas, hardcoded)
```

**Pokok arsitektur (fakta kode)**
- **Tidak ada indexer di snapshot ini.** Semua baca data on-chain langsung ke RPC per request (`backend-go/cmd/main.go:31-34`, `README.md:3`, `backend-go/internal/db/migrations/012_drop_onchain_mirror_tables.up.sql:1-13`). Branch `with_indexer` yang disebut README tidak ada di salinan ini.
- **Relayer tunggal.** Semua transaksi naskah, ulasan, revisi, dan editor dikirim oleh dompet operator backend (`backend-go/internal/service/ethereum.go:86-176`).
- **Pengecualian transaksi.** `payPublicationFee`, pendanaan dompet sesi, penarikan, dan `postComment` dikirim langsung dari browser (`frontend/src/core/services/wallet.ts:268-324`, `:340-367`, `:385-402`).
- **Model kepercayaan.** Backend diperlakukan tepercaya: memegang pemetaan identitas dan kunci operator (hal. 60).

## 3. Teknologi dan komponen

### Versi

| Bagian | Paket | Manifest | Lock | Laporan (hal. 59) |
|---|---|---|---|---|
| Kontrak | Solidity | 0.8.24, optimizer 200, viaIR, cancun (`smartcontract/hardhat.config.js:13-20`) | - | 0.8.24 |
| Kontrak | hardhat | ^2.22.0 | 2.28.6 | 2.22 |
| Kontrak | @openzeppelin/contracts dan -upgradeable | ^5.1.0 | 5.6.1 | 5.1 |
| Kontrak | @openzeppelin/hardhat-upgrades | ^3.6.0 | 3.9.1 | 3.6 |
| Kontrak | @nomicfoundation/hardhat-toolbox | ^6.1.2 | 6.1.2 | - |
| Backend | Go | 1.23 (`backend-go/go.mod:3`) | - | 1.23 |
| Backend | gin | v1.10.0 | - | 1.10 |
| Backend | go-ethereum | v1.14.11 | - | - |
| Backend | golang-jwt/v5 | v5.3.1 | - | - |
| Backend | keyfunc/v3, uuid, lib/pq, x/crypto, x/time | v3.3.8, v1.6.0, v1.10.9, v0.27.0, v0.9.0 | - | - |
| Oracle | Node dan ethers | Node 20 (`oracle/Dockerfile:1`), ethers ^6.13.0 | 6.16.0 | Node 20 |
| Frontend | next, react, react-dom | 16.2.7, 19.2.4, 19.2.4 | sama | 16.2, 19.2 |
| Frontend | viem, axios | ^2.52.0, ^1.17.0 | 2.52.0, 1.17.0 | - |
| Frontend | wagmi, @tanstack/react-query | ^3.6.16, ^5.100.14 | 3.6.16, 5.100.14 | - (0 import di `src`) |
| Frontend | lucide-react, tailwindcss | ^1.17.0, ^4 | 1.17.0, 4.3.0 | - |
| DB | PostgreSQL | 15-alpine (`docker-compose.yml:12`) | - | 15 |

README menyarankan Node 22 (`README.md:8`), sedangkan Dockerfile memakai Node 20.

### Paket backend (4.190 baris Go non-test)

| Paket | Baris | Fungsi |
|---|---|---|
| `cmd` | 154 | Wiring dependensi, CORS `*`, seluruh route (`backend-go/cmd/main.go:17-154`) |
| `internal/config` | 67 | Muat env. `JWT_SECRET` tidak divalidasi saat start (`config.go:36`) |
| `internal/db` | 77 | Koneksi PostgreSQL dan migrasi tertanam yang dijalankan setiap start (`postgres.go:13-50`, `:70-77`) |
| `internal/domain` | 14 | Struct `User` |
| `internal/handler` | 1.027 | HTTP: auth, user, journal, manuscript, article, editor, session, health |
| `internal/middleware` | 73 | `JWTAuth` dan `RequireRole` |
| `internal/repository` | 1.437 | Akses DB dan pembaca on-chain: user, sesi, identitas, verifikasi, komentar, jurnal, `ChainManuscriptReader` |
| `internal/usecase` | 284 | Auth, bind wallet, verifikasi identitas, orkestrasi unggah dan relay |
| `internal/service` | 388 | `EthereumService`, `PinataService`, `GoogleIdentityVerifier` |
| `internal/chainquery` | 669 | ABI, klien RPC ber-rate-limit, log berjendela, reader registry/oracle/DOI |

Folder `backend-go/migrations/` hanya berisi 001 yang identik dengan `internal/db/migrations/001_*` (hasil `diff`). Folder ini tidak dipakai kode karena migrasi di-embed dari `internal/db/migrations`.

### Fungsi oracle (399 baris JS)

| Berkas | Fungsi |
|---|---|
| `oracle/src/index.js` | Bootstrap, langganan dua event, baca `getField`, shutdown rapi |
| `oracle/src/provider.js` | WebSocket bila `SEPOLIA_RPC_WSS` ada, selain itu HTTP polling |
| `oracle/src/config.js` | Env dan validasi `ORACLE_PRIVATE_KEY` serta `REVIEW_ORACLE_ADDRESS` |
| `oracle/src/plagiarism.js` | Panggil API eksternal bila dikonfigurasi, selain itu mock dari hash string CID |
| `oracle/src/handlers/plagiarism.js` | Deduplikasi dan `fulfillPlagiarismCheck` |
| `oracle/src/handlers/reviewer.js` | Minta sesi ke backend lalu `fulfillReviewerSelection` |
| `oracle/src/reviewer.js`, `oracle/src/registry.js` | Kode mati berisi 10 penelaah fiktif, tidak diimpor `index.js` (cocok dengan hal. 83) |

## 4. Smart contract

Empat kontrak produksi dan satu mock pengujian, total 757 baris. Semua `pragma ^0.8.24`.

### 4.1 PublicationRegistry (`smartcontract/contracts/PublicationRegistry.sol`)

UUPS, AccessControl, EIP-712. Mesin status utama.

**Tipe data**
- `Status` (78-89): `SUBMITTED=0, CHECKING=1, UNDER_REVIEW=2, REVISION_REQUESTED=3, ACCEPTED=4, REJECTED=5, PUBLISHED=6, PENDING_EDITOR=7`.
- `Verdict` (91-95): `ACCEPT, REJECT, REVISE`.
- `Manuscript` (97-112): `id, author, cid, metadata, status, version, plagiarismScore, reviewers[], acceptCount, rejectCount, reviseCount, reviewCount, doi, field`.

**State**

| Nama | Tipe | Baris | Catatan |
|---|---|---|---|
| `doiToken` | `IDOIToken` | 135 | |
| `journalToken` | `IERC20` | 136 | |
| `reviewOracle` | `IReviewOracle` | 137 | |
| `nextManuscriptId` | `uint256` | 138 | Satu-satunya cara enumerasi |
| `_manuscripts` | `uint256 => Manuscript` | 140 | |
| `hasReviewed` | `msId => addr => bool` | 141 | Direset saat revisi |
| `reviewHashes` | `msId => addr => string` | 142 | Berisi CID, direset saat revisi |
| `nonces` | `addr => uint256` | 143 | Anti replay |
| `_verifiedReviewerFields` | `addr => string[]` | 145 | Bidang per alamat |
| Peran | `bytes32` | 114-118 | ADMIN, RESEARCHER, REVIEWER, ORACLE, OPERATOR |
| Typehash EIP-712 | `bytes32` | 121-129 | SubmitManuscript, ReviseManuscript, SubmitReview |
| `PLAGIARISM_THRESHOLD` | 30 | 131 | Skor > 30 ditolak |
| `PUBLICATION_FEE` | 100e18 | 132 | |
| `REVIEWER_INCENTIVE` | 10e18 | 133 | |

**Fungsi**

| Fungsi | Akses / modifier | Baris | Efek |
|---|---|---|---|
| `initialize(doi, jrt, oracle, admin)` | `initializer` | 174-193 | Set alamat, beri DEFAULT_ADMIN dan ADMIN ke admin, ORACLE_ROLE ke kontrak oracle |
| `domainSeparator()` | view publik | 204-206 | |
| `submitManuscript(cid, metadata, nonce, v, r, s)` | `onlyRole(OPERATOR_ROLE)` + EIP-712 | 208-236 | Penulis dipulihkan dari tanda tangan, status CHECKING, minta cek plagiarisme |
| `fulfillPlagiarism(msId, score)` | `onlyRole(ORACLE_ROLE)` | 238-257 | CHECKING ke REJECTED atau PENDING_EDITOR |
| `submitEditorReview(msId, approve, field, editorCid)` | `onlyRole(OPERATOR_ROLE)` | 262-282 | Setuju: UNDER_REVIEW dan minta penelaah. Tolak: REJECTED |
| `verifyReviewerFields(reviewer, fields)` | `onlyRole(OPERATOR_ROLE)` | 286-293 | Timpa bidang penelaah |
| `fulfillRandomReviewers(msId, reviewers)` | `onlyRole(ORACLE_ROLE)` | 295-305 | Set daftar penelaah, tanpa cek apakah sudah terisi |
| `submitReview(msId, reviewCid, verdict, comments, nonce, v, r, s)` | `onlyRole(OPERATOR_ROLE)` + EIP-712 | 310-350 | Catat suara, evaluasi bila semua sudah mengulas |
| `reviseManuscript(msId, newCid, nonce, v, r, s)` | `onlyRole(OPERATOR_ROLE)` + EIP-712 | 352-380 | Versi +1, reset ulasan, kembali CHECKING |
| `payPublicationFee(msId)` | tanpa role, `msg.sender == author`, status ACCEPTED | 385-429 | Tarik 100 JRT, bayar penelaah, mint DOI, PUBLISHED |
| `addResearcher`, `addReviewer`, `addOperator` | `onlyRole(ADMIN_ROLE)` | 431-447 | Peran RESEARCHER dan REVIEWER tidak lagi menjaga fungsi apa pun (cocok hal. 69) |
| `getManuscript`, `getStatus`, `getReviewers`, `getField`, `getVerifiedFields` | view | 449-478 | |
| `_evaluateDecision` | internal | 480-498 | Mayoritas `n/2+1`, tanpa mayoritas menjadi REVISION_REQUESTED |
| `_resetReviewState` | internal | 500-513 | Hapus suara, CID, dan daftar penelaah |
| `_authorizeUpgrade` | `onlyRole(ADMIN_ROLE)` | 536-538 | |

**Event (158-167):** `ManuscriptSubmitted`, `DecisionMade`, `IncentivePaid`, `ManuscriptRevised`, `ReviewSubmitted`, `ReviewersAssigned`, `DOIMinted`, `DOIRegistered`, `EditorReviewed`, `ReviewerFieldsVerified`.

**Error (147-156):** `InvalidState`, `NotAuthor`, `NotAssignedReviewer`, `AlreadyReviewed`, `InsufficientAllowance`, `ManuscriptNotFound`, `PlagiarismThresholdExceeded`, `TransferFailed`, `ZeroAddress`, `InvalidSignature`.

`PlagiarismThresholdExceeded` dideklarasikan tetapi tidak pernah di-revert. `Status.SUBMITTED` tidak pernah di-assign.

`DOILib` (26-68) membentuk DOI `10.55121/<tahun>.<chainId>.<msId>.<versi>`. Laporan mengakui ini bukan DOI terdaftar (hal. 66).

**Mesin status**

```
submitManuscript -> CHECKING -- skor > 30 --> REJECTED
                       | skor <= 30
                       v
                  PENDING_EDITOR -- editor tolak --> REJECTED
                       | editor setuju + field
                       v
                  UNDER_REVIEW -- semua penelaah mengulas -->
                     mayoritas ACCEPT --> ACCEPTED -- payPublicationFee --> PUBLISHED
                     mayoritas REJECT --> REJECTED
                     selain itu       --> REVISION_REQUESTED -- reviseManuscript --> CHECKING
```

### 4.2 ReviewOracle (`smartcontract/contracts/ReviewOracle.sol`)

AccessControl, tidak dapat di-upgrade.

| State | Baris |
|---|---|
| `REGISTRY_ROLE`, `ORACLE_ROLE` | 16-17 |
| `publicationRegistry` | 18 |
| `nextPlagiarismRequestId`, `nextReviewerRequestId` | 19-20 |
| `plagiarismRequestToMs`, `plagiarismRequestFulfilled` | 21-22 |
| `reviewerRequestToMs`, `reviewerRequestFulfilled` | 23-24 |

| Fungsi | Akses | Baris | Catatan |
|---|---|---|---|
| `constructor` | - | 56-59 | Deployer mendapat DEFAULT_ADMIN dan ORACLE_ROLE |
| `setPublicationRegistry(registry)` | `DEFAULT_ADMIN_ROLE` | 61-72 | Cabut role dari registry lama |
| `requestPlagiarismCheck(msId, cid)` | `REGISTRY_ROLE` | 74-82 | Emit event |
| `fulfillPlagiarismCheck(requestId, score)` | `ORACLE_ROLE` | 84-102 | Skor maksimal 100, satu kali pakai |
| `requestRandomReviewers(msId)` | `REGISTRY_ROLE` | 104-111 | Emit event |
| `fulfillReviewerSelection(requestId, reviewers)` | `ORACLE_ROLE` | 113-131 | Jumlah ganjil dan >= 3 |
| `getPublicationRegistry()` | view | 133-135 | |

Event (33-54): `PlagiarismCheckRequested`, `PlagiarismCheckFulfilled`, `ReviewerSelectionRequested`, `ReviewerSelectionFulfilled`.
Error (26-31): `RegistryNotSet`, `OracleZeroAddress`, `RequestAlreadyFulfilled`, `RequestNotFound`, `InvalidScore`, `InvalidReviewerCount`.

### 4.3 JournalToken (`smartcontract/contracts/JournalToken.sol`)

ERC-20 "JRT".

| Item | Baris | Keterangan |
|---|---|---|
| `MINTER_ROLE` | 8 | |
| `constructor(initialSupply)` | 13-18 | Deployer mendapat DEFAULT_ADMIN, MINTER, dan seluruh suplai. Skrip deploy memakai 1.000.000 (`scripts/deploy.js:25`) |
| `mint(to, amount)` | 20-24 | `MINTER_ROLE` |
| Error | 10-11 | `MintAmountZero`, `MintToZeroAddress` |
| Event | - | Hanya bawaan ERC-20 |

### 4.4 DOIToken (`smartcontract/contracts/DOIToken.sol`)

ERC-721 dengan URIStorage.

| Item | Baris | Keterangan |
|---|---|---|
| `MINTER_ROLE`, `_nextTokenId` | 9-10 | |
| `constructor` | 20-22 | Deployer mendapat DEFAULT_ADMIN. MINTER diberikan ke registry saat deploy (`scripts/deploy.js:77-80`) |
| `mint(to, tokenURI_)` | 24-33 | `MINTER_ROLE` |
| `postComment(doiId, hash)` | 35-39 | Tanpa role, syarat token ada |
| `tokenURI`, `supportsInterface` | 41-56 | Override |
| Event `CommentPosted` | 14-18 | `doiId`, `reader`, `hash` |
| Error `MintToZeroAddress` | 12 | |

Token DOI dapat ditransfer (tidak ada override transfer di berkas ini).

### 4.5 MockReviewOracle

`smartcontract/contracts/mocks/MockReviewOracle.sol:12-31`. Hanya untuk test, tanpa kontrol akses.

### 4.6 Hubungan antar kontrak

- Urutan deploy: JournalToken, DOIToken, ReviewOracle, Registry proxy, lalu grant MINTER dan `setPublicationRegistry` (`smartcontract/scripts/deploy.js:27-85`).
- `OPERATOR_ROLE` diberikan terpisah lewat `smartcontract/scripts/grant-roles.js:15-22`.
- Matriks peran di laporan (hal. 69) cocok dengan kode.

```
Registry --request*--> ReviewOracle --event--> oracle off-chain
Registry <--fulfill*-- ReviewOracle <--fulfill*-- oracle off-chain
Registry --mint--> DOIToken
Registry --transferFrom/transfer--> JournalToken
```

### 4.7 Temuan kontrak

1. **Sisa biaya terkunci.** Biaya 100 JRT ditarik ke kontrak, 10 JRT per penelaah dibayar (396-408), dan tidak ada fungsi withdraw di semua `.sol` (hasil `grep` kosong). **Inferensi:** dengan 3 penelaah, 70 JRT terkunci kecuali lewat upgrade.
2. **Penelaah ronde sebelumnya tidak dibayar.** `_resetReviewState` menghapus daftar penelaah (512), lalu pembayaran hanya membaca daftar terakhir (403). Laporan sendiri mencatat enam ulasan tetapi tiga `IncentivePaid` pada naskah uji (hal. 93).
3. **Teks ulasan masuk calldata.** `comments` adalah argumen `submitReview` (314) dan dikirim backend (`backend-go/internal/service/ethereum.go:254-261`). **Inferensi:** teks ulasan terbaca publik di input transaksi, bertentangan dengan Tabel III.5 (hal. 34) dan teks UI (`frontend/src/app/review/[msId]/page.tsx:477`).
4. **`reviewCid` tidak ditandatangani** (komentar di 307-309). **Inferensi:** relayer dapat mengganti CID ulasan.
5. **Penggantian penelaah.** `fulfillRandomReviewers` dapat dipanggil ulang selama UNDER_REVIEW (295-305), dan admin dapat memakai skrip `smartcontract/scripts/reassign-reviewers.js:31-48`.
6. **Tidak ada tenggat.** Evaluasi hanya berjalan saat `reviewCount == reviewers.length` (347-349). **Inferensi:** satu penelaah tidak merespons membuat naskah macet.
7. **Editor tidak terautentikasi di kontrak.** Keputusan editor hanya dijaga OPERATOR_ROLE (259-267, diakui hal. 39-40).
8. **Upgrade dilepas dari pemeriksaan storage.** `unsafeSkipStorageCheck: true` (`smartcontract/scripts/upgrade.js:28`).

## 5. Alur data

### Pendaftaran
Akun dibuat lewat `POST /auth/register` dengan peran `user` atau `reviewer` (`backend-go/internal/handler/auth.go:23-62`, `internal/usecase/auth.go:32-78`). Editor tidak bisa mendaftar sendiri, hanya di-seed (`007_editor_and_verification.up.sql:22-32`, `013_journals.up.sql:57-72`).

### Penulis: pengajuan
1. `/author/submit` memuat jurnal lewat `GET /journals` (`frontend/src/app/author/submit/page.tsx:31-36`).
2. Berkas diunggah lewat `POST /manuscripts/upload/file` ke Pinata dan mengembalikan CID (`page.tsx:80-87`, `backend-go/internal/handler/manuscript.go:52-73`, `internal/service/pinata.go:22-60`).
3. Browser membuat dompet sesi dan menyimpan kuncinya di localStorage (`page.tsx:94-95`, `frontend/src/core/services/wallet.ts:224-235`).
4. Browser membaca `nonces` dari RPC (`page.tsx:97`, `wallet.ts:91-98`).
5. Metadata `{title, abstract, journal}` ditandatangani EIP-712 (`page.tsx:100-117`, `wallet.ts:100-105`, `:244-252`).
6. `POST /manuscripts/submit` meneruskan ke `submitManuscript` (`page.tsx:122-128`, `handler/manuscript.go:85-108`, `internal/service/ethereum.go:233-239`, `PublicationRegistry.sol:208-236`).
7. Backend menyimpan `user_id` dan alamat sesi secara best-effort setelah transaksi berhasil (`handler/manuscript.go:110-115`, `internal/repository/session_wallet.go:49-57`).

### Oracle: pemeriksaan plagiarisme
`ReviewOracle` memancarkan `PlagiarismCheckRequested`. Oracle menghitung skor dan memanggil `fulfillPlagiarismCheck`, yang diteruskan ke `fulfillPlagiarism` (`oracle/src/index.js:43-46`, `oracle/src/handlers/plagiarism.js:5-37`, `ReviewOracle.sol:84-102`, `PublicationRegistry.sol:238-257`).

### Editor: verifikasi penelaah
1. Penelaah mengajukan bidang lewat `POST /reviewer/specialization` (`handler/editor.go:144-173`).
2. Editor melihat antrian beserta email, wallet, dan `identity_email` (`internal/repository/verification.go:83-112`).
3. Editor menyetujui, backend memanggil `verifyReviewerFields(walletAsli, fields)` (`handler/editor.go:110`), lalu memperbarui `verified_fields` dan peran (`verification.go:152-174`).

### Editor: penyaringan
1. `GET /editor/manuscripts` membaca semua naskah dari kontrak, memfilter status, dan menetapkan editor secara malas (`verification.go:190-241`, `:285-298`).
2. `POST /editor/manuscripts/:id/review` mengunggah JSON keputusan ke IPFS lalu memanggil `submitEditorReview` (`handler/editor.go:194-248`).

### Oracle: pemilihan penelaah
1. Oracle menangkap `ReviewerSelectionRequested` dan membaca `getField` (`oracle/src/index.js:49-59`).
2. Oracle memanggil `POST /internal/reviewer-sessions` (`oracle/src/handlers/reviewer.js:8-20`).
3. Backend memilih acak dari `users` dan membuat dompet sesi per penelaah per naskah (`session_wallet.go:64-133`).
4. Oracle mengirim daftar alamat sesi ke chain (`handlers/reviewer.js:50-54`).

### Penelaah: ulasan
1. `/reviewer/assignments` mengambil penugasan beserta kunci privat sesi (`frontend/src/app/reviewer/assignments/page.tsx:52-64`, `handler/session.go:74-82`).
2. `/review/[msId]` menandatangani `(msId, comments, verdict, nonce)` dengan kunci itu (`frontend/src/app/review/[msId]/page.tsx:210-231`).
3. `POST /manuscripts/:id/reviews`: backend mengunggah JSON ulasan lalu merelai (`internal/usecase/manuscript.go:82-91`, `PublicationRegistry.sol:310-350`).

### Penulis: revisi dan publikasi
- **Revisi:** tanda tangan dengan kunci sesi di browser yang sama (`frontend/src/app/author/revise/page.tsx:103-144`), lalu `reviseManuscript`.
- **Publikasi:** `fundAndPublish`. MetaMask utama mengirim 100 JRT dan gas ke dompet sesi, lalu dompet sesi melakukan `approve` dan `payPublicationFee` (`frontend/src/core/services/wallet.ts:268-324`, `frontend/src/app/tracker/[id]/page.tsx:276-285`). DOI NFT di-mint ke dompet sesi (`PublicationRegistry.sol:422`).

### Penelaah: pendapatan
`withdrawFromSession`: MetaMask utama mengirim gas ke dompet sesi, lalu seluruh JRT ditransfer ke wallet utama (`wallet.ts:340-367`). UI mengakui ini membuat tautan on-chain (`frontend/src/app/reviewer/earnings/page.tsx:127-133`).

### Pembaca
- Baca artikel lewat `GET /manuscripts?status=PUBLISHED`, detail, dan open-review (`frontend/src/app/articles/page.tsx:60-68`, `frontend/src/components/OpenReviewPanel.tsx:72-81`).
- Komentar: `POST /comments/prepare` menyimpan isi dan mengembalikan hash, lalu MetaMask memanggil `postComment` (`frontend/src/components/Comments.tsx:64-74`, `handler/article.go:189-211`).

### Admin
Deploy, grant role, upgrade (`smartcontract/scripts/*.js`). Tidak ada UI admin.

## 6. Backend, DB, dan Oracle

### Endpoint

Semua berawalan `/api/v1`. Route di `backend-go/cmd/main.go:93-146`. Total 25: 10 publik, 14 JWT, 1 secret.

| Method | Path | Fungsi | Auth | Handler |
|---|---|---|---|---|
| GET | `/health` | Status layanan dan RPC | Publik | `handler/health.go:23` |
| POST | `/auth/register` | Daftar `user` atau `reviewer` | Publik | `handler/auth.go:23` |
| POST | `/auth/login` | Bcrypt cost 10, JWT HS256 1 jam (`usecase/auth.go:71`, `:100-104`) | Publik | `handler/auth.go:64` |
| POST | `/auth/logout` | Hanya pesan, tanpa revokasi | Publik | `handler/auth.go:101` |
| GET | `/users/me` | Profil | JWT | `handler/auth.go:105` |
| PATCH | `/users/wallet-bind` | Ikat wallet tanpa bukti kepemilikan | JWT | `handler/user.go:19` |
| PATCH | `/users/identity-verify` | Verifikasi Google ID token | JWT | `handler/user.go:42` |
| GET | `/journals` | Katalog | Publik | `handler/journal.go:19` |
| GET | `/manuscripts` | Daftar, `page`, `limit`, `status`, identitas penulis dibuka pada status final | Publik | `handler/article.go:70` |
| GET | `/manuscripts/:id` | Detail, riwayat event | Publik | `handler/manuscript.go:32` |
| GET | `/manuscripts/:id/open-review` | Laporan per versi | Publik | `handler/article.go:121` |
| GET | `/manuscripts/:id/comments` | Komentar, email komentator bila terdaftar | Publik | `handler/article.go:215` |
| POST | `/manuscripts/upload/file` | Unggah ke IPFS | Publik | `handler/manuscript.go:52` |
| POST | `/manuscripts/submit` | Relay pengajuan dan simpan pemetaan | JWT | `handler/manuscript.go:85` |
| POST | `/manuscripts/:id/revise` | Relay revisi | JWT | `handler/manuscript.go:129` |
| POST | `/manuscripts/:id/reviews` | Unggah dan relay ulasan | JWT + `reviewer` | `handler/manuscript.go:168` |
| POST | `/comments/prepare` | Hash, unggah, simpan isi | JWT | `handler/article.go:189` |
| POST | `/internal/reviewer-sessions` | Pilih penelaah dan buat sesi | `X-Oracle-Secret` | `handler/session.go:30` |
| GET | `/reviewer/assignments` | Penugasan dan kunci privat sesi | JWT + `reviewer` | `handler/session.go:74` |
| GET | `/reviewer/specialization` | Status bidang | JWT + `reviewer`/`user` | `handler/editor.go:126` |
| POST | `/reviewer/specialization` | Ajukan bidang | JWT + `reviewer`/`user` | `handler/editor.go:144` |
| GET | `/editor/reviewer-verifications` | Antrian | JWT + `editor` | `handler/editor.go:50` |
| POST | `/editor/reviewer-verifications/:id/decision` | Setuju atau tolak | JWT + `editor` | `handler/editor.go:66` |
| GET | `/editor/manuscripts` | Naskah PENDING_EDITOR | JWT + `editor` | `handler/editor.go:175` |
| POST | `/editor/manuscripts/:id/review` | Keputusan penyaringan | JWT + `editor` | `handler/editor.go:194` |

`ManuscriptHandler.List` (`handler/manuscript.go:23`) dan `AuthHandler.Health` (`handler/auth.go:94`) ada tetapi tidak diberi route.

### Skema DB per migrasi (`backend-go/internal/db/migrations/`)

| Migrasi | Isi |
|---|---|
| 001 | `users` (id, email unik, password_hash, wallet_address) dan tabel cermin on-chain: `indexer_checkpoints`, `processed_events`, `manuscripts`, `manuscript_reviewers`, `reviews`, `manuscript_revisions`, `plagiarism_requests`, `doi_comments`, `incentive_payments` |
| 002-004 | Tambah kolom ke tabel cermin |
| 005 | `submission_wallets` (user_id, address, ms_id) dan `reviewer_sessions` (ms_id, user_id, main_address, session_address, session_privkey, tier, UNIQUE ms_id + main_address) |
| 006 | `users.role`, `users.specialities` |
| 007 | `users.verified_fields`, `reviewer_field_requests`, seed `editor@desci.local` |
| 008 | Seed 3 penelaah dengan wallet tetap, ditimpa ulang setiap start |
| 009 | `reviewer_sessions.tier` menjadi TEXT, kini berisi slug bidang |
| 010 | Kolom versi dan `comment_contents` |
| 011 | `users.identity_provider`, `identity_subject`, `identity_email`, indeks unik |
| 012 | Drop seluruh tabel cermin |
| 013 | `categories`, `journals` (7 baris), `manuscript_assignments`, 3 editor kategori |

**Inferensi:** skema efektif setelah start adalah `users`, `submission_wallets`, `reviewer_sessions`, `reviewer_field_requests`, `comment_contents`, `categories`, `journals`, dan `manuscript_assignments`. Karena semua migrasi dijalankan ulang setiap start tanpa tabel versi (`internal/db/postgres.go:70-77`), tabel cermin dibuat lalu di-drop lagi setiap start. Migrasi `.down.sql` tidak dipakai kode.

### Cara IPFS dipakai dan titik abstraksi

- **Antarmuka unggah:** `usecase.StorageService` (`internal/usecase/manuscript.go:11-13`), `articleStorage` (`handler/article.go:14-16`), `editorStorage` (`handler/editor.go:19-21`). Semuanya `UploadFile(data, filename) (string, error)`.
- **Implementasi tunggal:** `PinataService.UploadFile` (`internal/service/pinata.go:22-60`), di-wire di `cmd/main.go:60`.
- **Data yang diunggah:** berkas naskah, JSON ulasan (`usecase/manuscript.go:83-85`), JSON keputusan editor (`handler/editor.go:228-231`), teks komentar (`handler/article.go:200-201`).
- **Unduh tidak diabstraksi:** backend tidak punya endpoint unduh. Frontend memakai `https://ipfs.io/ipfs/` hardcoded di 8 baris: `tracker/[id]/page.tsx:358,516,606`, `OpenReviewPanel.tsx:181`, `review/[msId]/page.tsx:331`, `editor/page.tsx:314`, `reviewer/assignments/page.tsx:105`, `articles/[id]/page.tsx:141`.
- **Kegagalan disamarkan:** setiap kegagalan Pinata mengembalikan `mockCID, nil` (`pinata.go:32-57`), sehingga cabang error di pemanggil tidak pernah aktif.
- **Format CID tidak divalidasi kontrak** (`PublicationRegistry.sol:229`).

**Inferensi:** layanan IPFS simulasi cukup memenuhi antarmuka `UploadFile`, ditambah satu env gateway di frontend untuk menggantikan 8 URL tersebut.

### Kerja oracle

| Aspek | Isi |
|---|---|
| Event didengar | `PlagiarismCheckRequested(requestId, msId, cid)`, `ReviewerSelectionRequested(requestId, msId)` (`oracle/src/index.js:43-59`) |
| Transaksi | `fulfillPlagiarismCheck`, `fulfillReviewerSelection` |
| Baca | `getField`, `plagiarismRequestFulfilled`, `reviewerRequestFulfilled` |
| HTTP keluar | `POST {BACKEND_URL}/api/v1/internal/reviewer-sessions`, dan `PLAGIARISM_API_URL` bila ada (`POST {cid}`, harap `{score}`) |
| Deduplikasi | Set di memori dan status on-chain |
| Bukan pekerjaan oracle | Membaca isi berkas. Oracle hanya menerima CID |

**Inferensi, keterbatasan operasional:**
- `contract.on` hanya menerima event baru, jadi event saat oracle mati hilang.
- Bila backend membalas 409 karena penelaah kurang dari 3, oracle hanya mencatat error (`handlers/reviewer.js:55-57`) dan tidak mencoba ulang. Naskah tetap UNDER_REVIEW tanpa penelaah.

## 7. Frontend

### Route (18 halaman, `frontend/src/app/`)

| Path | Peran | Fungsi | API / kontrak | Status |
|---|---|---|---|---|
| `/` | Publik | Landing | - | Fungsional, murni dekoratif |
| `/login` | Publik | Masuk | `POST /auth/login` | Fungsional |
| `/register` | Publik | Daftar, pilih bidang | `POST /auth/register` | Fungsional |
| `/profile` | Login | Bind wallet, verifikasi Google | `GET /users/me`, `PATCH /users/wallet-bind`, `PATCH /users/identity-verify`, MetaMask | Fungsional, Google opsional |
| `/articles` | Publik | Daftar terbit | `GET /manuscripts?status=PUBLISHED` | Fungsional, pencarian hanya menyaring halaman aktif (`page.tsx:77-79`) |
| `/articles/[id]` | Publik | Detail, open review, komentar | `GET /manuscripts/:id`, `/open-review`, `/comments`, `POST /comments/prepare`, `DOIToken.postComment` | Fungsional, ada dugaan bug judul (lihat bawah) |
| `/articles/[id]/peer-reviews` | Publik | Laporan ulasan | - | **Placeholder**, `MOCK_REVIEWS` (`page.tsx:4-20`), tidak ditautkan |
| `/tracker` | Publik | Semua naskah semua status | `GET /manuscripts` | Fungsional, hanya halaman pertama (default limit 12) |
| `/tracker/[id]` | Publik, aksi penulis | Riwayat, bayar, tautan revisi | `GET /manuscripts/:id`, `JournalToken.transfer/approve`, `payPublicationFee` | Fungsional |
| `/author/submit` | Login | Pengajuan | `GET /journals`, upload, `nonces`, `POST /manuscripts/submit` | Fungsional |
| `/author/revise` | Login | Revisi | `GET /manuscripts/:id`, upload, `nonces`, `POST /manuscripts/:id/revise` | Fungsional, harus browser yang sama |
| `/editor` | Editor | Verifikasi dan penyaringan | 4 endpoint `/editor/*` | Fungsional |
| `/review/[msId]` | Penelaah | Beri ulasan | `GET /manuscripts/:id`, `GET /reviewer/assignments`, `nonces`, `POST /manuscripts/:id/reviews` | Fungsional, teks UI masih menyebut indexer dan hash |
| `/reviewer/assignments` | Penelaah | Daftar tugas | `GET /reviewer/assignments` | Fungsional |
| `/reviewer/earnings` | Penelaah | Saldo dan tarik | `GET /reviewer/assignments`, `balanceOf`, `transfer` | Fungsional |
| `/reviewer/specialization` | Penelaah, user | Ajukan bidang | `GET/POST /reviewer/specialization` | Fungsional |
| `/reviewer/submit` | Penelaah | Form lama | `POST /manuscripts/:id/reviews` tanpa tanda tangan | **Rusak**, backend menolak (`handler/manuscript.go:188-191`), tidak ditautkan |
| `/reviewer/update` | Penelaah | Ubah ulasan | - | **Placeholder**, `setTimeout` dan `alert` (`page.tsx:34-38`), tidak ditautkan |

Tiga halaman terakhir yang bertanda placeholder atau rusak tidak dirujuk dari `Navbar.tsx:23-41` maupun halaman lain (hasil `grep`).

**Dugaan bug (inferensi statis, perlu diuji).** `ManuscriptDetail` memiliki field `Metadata` di tingkat luar yang tidak pernah diisi, dan menimpa field dengan tag JSON yang sama pada `ManuscriptSummary` tertanam (`backend-go/internal/repository/manuscript_reader.go:48`, `:102`, `:374-381`). Akibatnya `metadata` dari `GET /manuscripts/:id` akan kosong dan `/articles/[id]` menampilkan "Untitled" tanpa abstrak (`frontend/src/app/articles/[id]/page.tsx:57-64`, `:104`).

### Cara auth wallet

Tidak ada login berbasis wallet.
1. Login memakai email dan password, JWT disimpan di localStorage (`frontend/src/core/context/AuthContext.tsx:33-41`, `:55-60`).
2. MetaMask hanya dipakai untuk mengikat alamat lewat `eth_requestAccounts` tanpa tanda tangan bukti kepemilikan (`frontend/src/app/(protected)/profile/page.tsx:48-55`, `backend-go/internal/usecase/user.go:25-51`), serta mengirim transaksi pendanaan, penarikan, dan komentar.
3. Tanda tangan aksi naskah memakai kunci dompet sesi tanpa MetaMask (`wallet.ts:244-252`).
4. Guard peran dilakukan di `useEffect` tiap halaman, folder `(protected)` tidak punya layout guard. Axios tidak punya interceptor 401 (`frontend/src/core/services/api.client.ts:3-8`).

### Dependensi dan elemen yang dibuang saat strip-down

| Item | Lokasi | Tindakan |
|---|---|---|
| `tailwindcss`, `@tailwindcss/postcss` | `package.json:22,29`, `postcss.config.mjs`, `globals.css:1` | Buang |
| `lucide-react` | 19 berkas | Buang, ganti teks |
| `next/font/google` (Geist) | `app/layout.tsx:2-13` | Buang, juga menghapus unduhan font saat build |
| `wagmi`, `@tanstack/react-query` | `package.json:12,19` | Buang, 0 import di `src` |
| `babel-plugin-react-compiler`, `reactCompiler: true` | `package.json:26`, `next.config.ts:5` | Opsional, bukan kebutuhan fungsional |
| Toast berbasis kelas Tailwind | `core/context/ToastContext.tsx:39-55` | Ganti teks status polos |
| Navbar fixed, blur, hamburger | `components/layout/Navbar.tsx:49-169` | Ganti daftar tautan |
| Footer dengan tautan `#` | `components/layout/Footer.tsx` | Buang |
| Hero landing | `app/page.tsx` | Ganti daftar tautan per peran |
| Stepper visual | `components/ManuscriptStepper.tsx` | Ganti teks status |
| Badge warna | `StatusBadge` di 5+ halaman | Ganti teks |
| Aset `public/*.svg` | Tidak dirujuk `src` | Buang |

**Tidak ditemukan:** shadcn, Radix, framer-motion, clsx, class-variance-authority. Animasi hanya kelas Tailwind (`animate-spin`, `animate-pulse`, `transition-*`).

**Skala:** 809 baris mengandung `className` di 28 berkas; 160 baris memakai kelas animasi, transisi, bayangan, blur, atau gradien.

**Inferensi:** langkah termurah adalah melepas `@import "tailwindcss"` agar semua kelas mati, lalu membersihkan bertahap. Efek sampingnya, elemen `hidden` dan dua versi menu akan sama-sama tampil, jadi Navbar perlu ditulis ulang lebih dulu.

Yang tetap dibutuhkan: `next`, `react`, `react-dom`, `viem`, `axios` (atau `fetch`).

### Kematangan dibanding Hugo dan Ciko

| Aspek | Roihan | Hugo | Ciko |
|---|---|---|---|
| Keberadaan frontend | Next.js, 18 route, 5.483 baris di `src` | 10 HTML statis dan TS, total 1.903 baris | **Tidak ada** (`find` HTML/TSX kosong). Hanya Swagger di `/api` (`[Ciko]/server/src/main.ts:21-22`) |
| Build | `next build` | Perlu `build:web`, `public/js/` di-ignore (`[Hugo]/.gitignore:8`) | - |
| Autentikasi | Email/password, JWT, peran | Tanpa login, MetaMask sebagai identitas (`[Hugo]/frontend/shared/dapp.ts:34-41`, `[Hugo]/frontend/reviewer.ts:1-3`) | Tanpa auth (grep JWT/guard hanya kena evaluasi dan DTO) |
| Peran | Penulis, editor, penelaah, pembaca | Author, editor, reviewer, public, ditambah halaman evaluasi | - |
| Revisi, komentar, riwayat event | Ada | Tidak ada halaman revisi menurut daftar berkas | - |
| Kedekatan dengan target polos | Jauh, Tailwind berat | Dekat, `style.css` 30 baris (`[Hugo]/public/style.css`) | - |
| Kualitas otomatis | Lint, typecheck, build di CI (`.github/workflows/ci.yml:45-59`) | Tidak ditemukan CI | Tidak ditemukan CI |

**Inferensi:** tebakan Anda benar untuk kelengkapan fungsi, Roihan paling matang. Biayanya ada di strip-down dan penyesuaian alur. Halaman Hugo (`pipeline`, `monitor`, `evaluation`) berguna sebagai rujukan tampilan QoS q1-q4 dan audit distribusi. Antarmuka Roihan hanya mengenal alur miliknya, jadi halaman submit, editor, dan review perlu ditulis ulang logikanya mengikuti P01-P08 Ciko.

## 8. Terimplementasi di kode vs hanya di laporan

| Fitur | Di laporan? | Di kode? | Bukti file:baris | Catatan |
|---|---|---|---|---|
| Mesin status 8 status | Ya, hal. 42, 62 | Ya | `PublicationRegistry.sol:78-89` | Cocok. `SUBMITTED` tidak pernah dipakai |
| Tanda tangan EIP-712 | Ya, hal. 63 | Ya | `PublicationRegistry.sol:214-223` | Cocok |
| Keputusan mayoritas | Ya, hal. 64 | Ya | `PublicationRegistry.sol:480-498` | Cocok |
| Insentif atomik dan mint DOI | Ya, hal. 53, 65 | Ya | `PublicationRegistry.sol:385-429` | Laporan tidak membahas sisa 70 JRT yang tidak bisa ditarik |
| Pembayaran dari dompet asli penulis | Ya, hal. 39, 53 | **Berbeda** | `wallet.ts:268-324`, `tracker/[id]/page.tsx:285` | Kode: dompet sesi yang membayar, didanai dompet utama. `payPublicationFee` di `wallet.ts:151` tidak dipakai. Komentar kontrak di `:383-384` usang |
| Jumlah endpoint 23 | Ya, hal. 70 | **Berbeda, 25** | `cmd/main.go:93-146` | Laporan tidak memuat `identity-verify` dan `revise` |
| `POST /manuscripts/:id/reviews` publik | Ya, hal. 71-72 | **Berbeda** | `cmd/main.go:122` | Kode memakai JWT dan peran reviewer |
| Peran bukan middleware | Ya, hal. 72 | **Berbeda** | `internal/middleware/role.go:12-25`, `cmd/main.go:130-140` | Middleware ada, `requireEditor` juga tetap ada |
| EthereumService 4 fungsi | Ya, hal. 73 | **Berbeda, 5** | `service/ethereum.go:233-282` | Ada `ReviseManuscript` |
| Penugasan editor saat event diproses, `UPDATE manuscripts` | Ya, hal. 78-79 | **Berbeda** | `repository/verification.go:285-298` | Kode: lazy, `INSERT manuscript_assignments`. Tabel `manuscripts` sudah di-drop |
| Kolom `journal_id` | Ya, hal. 79 | **Tidak** | `repository/journal.go:61-71` | Dibaca dari metadata saat dibutuhkan |
| Komentar ulasan hanya di IPFS | Ya, hal. 34 | **Berbeda** | `PublicationRegistry.sol:314`, `service/ethereum.go:254-261` | Teks juga masuk calldata (inferensi) |
| Oracle tidak perlu tahu identitas | Ya, hal. 31 | **Sebagian** | `handler/session.go:65-68` | Respons memuat `mainAddress`, oracle hanya memakai `sessionAddress` |
| Layanan plagiarisme eksternal | Ya, hal. 51, 82 | **Mock default** | `oracle/src/plagiarism.js:4-8`, `:30-46` | Hash string CID, isi berkas tidak dibaca. Kegagalan API juga jatuh ke mock |
| Unggah IPFS | Ya, hal. 77 | Ya, ada mock | `service/pinata.go:23-26`, `:32-57` | CID mock sama untuk semua berkas |
| Mock transaksi | Tidak disebut | Ya | `service/ethereum.go:87-94` | Hash palsu tanpa alamat atau kunci. **Inferensi:** baca akan gagal pada alamat nol, jadi mode ini tidak benar-benar usable |
| Kategori dapat ditambah tanpa ubah kode | Ya, hal. 35 | **Sebagian** | `handler/editor.go:23-29`, `usecase/auth.go:24-30`, `RegisterForm.tsx:9-15`, `editor/page.tsx:17-23`, `specialization/page.tsx:19-25` | Daftar bidang hardcoded di beberapa tempat |
| Katalog jurnal | Ya, hal. 78 | Ya, hardcoded | `013_journals.up.sql:28-36` | Laporan mengakui, tanpa UI admin |
| Verifikasi identitas ORCID | Ideal, hal. 40 | Tidak, Google | `service/google_identity.go:11-46` | Laporan mengakui, hal. 60 |
| Dompet sesi dan kunci plaintext | Ya, hal. 75-76 | Ya | `session_wallet.go:100-116`, `005_session_wallets.up.sql:16-26` | Laporan mengakui risikonya |
| Kebijakan identitas asimetris | Ya, hal. 76 | Ya | `handler/article.go:53-57`, `:137-141` | Dibuka juga untuk REJECTED |
| Upgrade UUPS | Ya, hal. 42 | Ya | `PublicationRegistry.sol:536-538` | Hal. 56 menyebut keempat kontrak immutable, ini tidak konsisten dengan UUPS |
| Bab keterbatasan rinci | Dirujuk hal. 100 | Hampir kosong | V.2.2.2, hal. 98 | Rincian tersebar di IV.2.3 |
| Jumlah test kontrak 88 | Ya, hal. 86 | **95 `it(`** | `test/PublicationSystem.test.js` 57, `FullFlow.test.js` 31, `OracleGuards.test.js` 7 | Hasil grep, tidak dijalankan |
| Test backend 3 | Ya, hal. 86 | **8 fungsi** | `integration_test.go` 5, `usecase/user_test.go` 2, `manuscript_reader_test.go` 1 | Hasil grep |
| Halaman mock atau rusak | Tidak disebut | Ya | `articles/[id]/peer-reviews/page.tsx:4-20`, `reviewer/update/page.tsx:34-38`, `reviewer/submit/page.tsx:38-41` | Hapus saat integrasi |
| Kode oracle mati | Ya, hal. 83 | Ya | `oracle/src/reviewer.js`, `oracle/src/registry.js` | `.env.example` masih memuat `REVIEWER_*` |
| Skrip Amoy | Tidak | Rusak | `smartcontract/package.json:10-11`, `hardhat.config.js:23-32` | Jaringan `amoy` tidak ada |
| `ReviewOracle.addReviewer` di panduan | Tidak | **Tidak ada fungsinya** | `smartcontract/README.md:108`, `scripts/deploy.js:98` | Dokumentasi usang |
| Reverse mapping otomatis penelaah anti konflik kepentingan | Ideal, hal. 41 | Tidak | `session_wallet.go:65-73` | Query tidak mengecualikan penulis |
| TODO dan FIXME | - | Tidak ditemukan | hasil `grep` | Kode tidak memakai penanda ini |

**Hasil perhitungan penting.** Menjalankan algoritma `mockCheck` pada `mockCID` memberi skor **93**, di atas ambang 30. **Inferensi:** dengan `PINATA_JWT` kosong dan `PLAGIARISM_API_URL` kosong, semua naskah otomatis REJECTED. Pada CID asli, peluang lolos sekitar 31 dari 101 bila hash dianggap merata. README tidak memperingatkan hal ini (`README.md:65-66`).

## 9. Cara menjalankan

**Hasil baca kode, BUKAN hasil dijalankan.**

### Prasyarat (`README.md:5-11`)
Docker Compose; Node 22 dan Go 1.23 bila di luar Docker; wallet dengan Sepolia ETH; RPC Sepolia dedicated; opsional Pinata JWT dan Google client ID.

### Deploy kontrak ke Sepolia (`README.md:17-30`)
```bash
cd smartcontract
npm install
cp .env.example .env
npx hardhat run scripts/deploy.js --network sepolia
REGISTRY_CONTRACT_ADDRESS=<proxy> npx hardhat run scripts/grant-roles.js --network sepolia
```

### Env

| Berkas | Variabel |
|---|---|
| `smartcontract/.env` | `PRIVATE_KEY`, `SEPOLIA_RPC_URL`, `ETHERSCAN_API_KEY`. Skrip juga memakai `REGISTRY_CONTRACT_ADDRESS`, `OPERATOR_ADDRESS`, `PROXY_ADDRESS`, `MS_ID`, `REVIEWERS` |
| `backend-go/.env` | `PORT`, `JWT_SECRET`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSLMODE`, `PINATA_JWT`, `OPERATOR_PRIVATE_KEY`, `RPC_URL`, `REGISTRY_CONTRACT_ADDRESS`, `REVIEW_ORACLE_CONTRACT_ADDRESS`, `DOI_TOKEN_CONTRACT_ADDRESS`, `REGISTRY_DEPLOY_BLOCK`, `GOOGLE_CLIENT_ID`, dan `ORACLE_SHARED_SECRET` (wajib, tidak ada di `.env.example`, `config.go:41`) |
| `oracle/.env` | `SEPOLIA_RPC_WSS`, `SEPOLIA_RPC_URL`, `ORACLE_PRIVATE_KEY`, `REVIEW_ORACLE_ADDRESS`, `PLAGIARISM_API_URL`, `POLL_INTERVAL_MS`, ditambah `REGISTRY_ADDRESS`, `BACKEND_URL`, `ORACLE_SHARED_SECRET` (`oracle/src/config.js:13-20`, tiga terakhir tidak ada di `.env.example`) |
| `frontend/.env.local` | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_REGISTRY_CONTRACT_ADDRESS`, `NEXT_PUBLIC_JOURNAL_TOKEN_ADDRESS`, `NEXT_PUBLIC_DOI_TOKEN_ADDRESS`, `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` |
| `.env` akar repo | `REGISTRY_CONTRACT_ADDRESS`, `JWT_SECRET` (`README.md:70-77`) |

`ORACLE_PRIVATE_KEY` harus kunci deployer kecuali role diberikan terpisah (`README.md:68`, `ReviewOracle.sol:58`). Bila `REGISTRY_CONTRACT_ADDRESS` akar tidak diisi, oracle memakai alamat hardcoded milik pengembang (`docker-compose.yml:79`).

### Jalankan
```bash
# Salin env dulu
cp backend-go/.env.example backend-go/.env
cp oracle/.env.example oracle/.env
cp frontend/.env.local.example frontend/.env.local

# Semua dengan Docker
docker compose up --build

# Atau per layanan
docker compose up -d database
cd backend-go && DB_PORT=5433 go run ./cmd/main.go
cd oracle && npm install && BACKEND_URL=http://localhost:3001 npm start
cd frontend && npm install && npm run dev
```

| Layanan | Port |
|---|---|
| Frontend | 3000 |
| Backend | 3001 (`/api/v1/health`) |
| PostgreSQL | Host 5433, user dan password `postgres`, DB `publish_db` |
| Oracle | Tanpa port |

Migrasi berjalan otomatis setiap backend start. `NEXT_PUBLIC_*` ditanam saat build.

### Akun demo (`README.md:116-124`)
`editor@desci.local` / `editor123`, `editor.ai@desci.local`, `editor.chain@desci.local`, `editor.data@desci.local` (password sama), `rev1@mail.com` / `rev1`, `rev2@mail.com` / `rev2`, `rev3@mail.com` / `rev3`. Wallet penelaah milik pengembang asli dan ditimpa setiap start, ganti di `008_seed_reviewers.up.sql` (`README.md:130-140`). Penulis butuh JRT dari deployer (`README.md:126`).

### Test
```bash
cd smartcontract && npx hardhat test
cd backend-go && go test ./...
docker compose up -d database
cd backend-go && go test -tags=integration ./test/integration/...
cd frontend && npm run lint && npx tsc --noEmit && npm run build
```
CI tidak menjalankan test kontrak maupun `go test` (`.github/workflows/ci.yml:45-97`).

### Jaringan lokal (inferensi, belum teruji)
`npx hardhat node` lalu `--network localhost` secara teori bisa untuk kontrak, tetapi **frontend belum bisa**:
- Chain terkunci ke Sepolia di `wallet.ts:3`, `:42`, `:46`, `:56-79`, `:84`, `:103`, `:257`.
- **Jebakan.** `DOMAIN.chainId` hardcoded 11155111 (`wallet.ts:103`), sedangkan kontrak memakai chain aktif. Tanda tangan dipulihkan menjadi alamat berbeda dengan nonce 0, sehingga `submitManuscript` tetap berhasil tetapi dengan penulis salah (`PublicationRegistry.sol:220-223`). Revisi dan pembayaran kemudian gagal `NotAuthor`.
- Rate limit 2 RPS tetap berlaku (`internal/chainquery/client.go:31`).
- Script `deploy:local` berjalan di jaringan in-process, sehingga kontrak hilang setelah selesai.

## 10. Tumpang tindih dan bentrok dengan Ciko dan Hugo

### Perbandingan

| Aspek | Roihan | Ciko | Hugo |
|---|---|---|---|
| Model naskah | `msId uint256`, `cid`, `metadata` plaintext (`PublicationRegistry.sol:97-112`) | `sessionId bytes32`, hash asli, hash anonim, hash metadata, URI anonim (`[Ciko]/contracts/contracts/PublicationSessions.sol:38-88`) | `Batch{author, escrowAmount, reviewers, distributed, journalName}` (`[Hugo]/contracts/IncentiveEngine.sol:38-44`), data paper di JSON (`[Hugo]/server/index.ts:661`) |
| Status | 8 | 13 (`[Ciko]/contracts/contracts/interfaces/IPublicationSessions.sol:5-19`) | Boolean `distributed` |
| Autentikasi | Email/password, JWT | Tidak ada. Server memakai satu `SERVER_PRIVATE_KEY` (`[Ciko]/server/src/blockchain/blockchain.service.ts:28-35`) | MetaMask tanpa login (`[Hugo]/frontend/shared/dapp.ts:34-41`) |
| Identitas di penyimpanan | Tabel `users` (email, wallet). Kolom nama tidak ditemukan | `identityCommitment` on-chain (`[Ciko]/contracts/contracts/PermanentAccounts.sol:21-23`), nama dan email hanya di DTO intake (`[Ciko]/server/src/manuscripts/dto/upload-manuscript.dto.ts:10-23`), tanpa DB (`[Ciko]/README.md:283`) | JSON file, alamat reviewer |
| Pseudonim | Dompet sesi penulis dan penelaah. Editor tanpa pseudonim on-chain | Ephemeral untuk Author, Reviewer, Editor (`[Ciko]/contracts/contracts/interfaces/IEphemeralAccounts.sol:5-9`), editor di `PublicationSessions.sol:90` | Tidak ada, alamat tetap |
| Ulasan | Verdict langsung, 3 nilai | Commit-reveal, 4 rekomendasi, gray zone (`[Ciko]/contracts/contracts/ReviewSubmissions.sol:73`, `:115`, `[Ciko]/contracts/contracts/interfaces/IReviewDecisions.sol:5-10`) | Teks ulasan untuk QoS (`[Hugo]/middleware/qos/types.ts:16-39`) |
| Anonimisasi PDF | Tidak ada | Ada (`[Ciko]/README.md:66-71` pada bagian P04) | Tidak ada |
| Pembayaran | 100 JRT setelah ACCEPTED, per penelaah tetap | Tidak ada | ETH di muka lewat `createBatch` (`IncentiveEngine.sol:72`) |
| Token | JRT dan DOI NFT | Tidak ada | Reputasi SBT tanpa transfer (`[Hugo]/contracts/ReputationSBT.sol:16`, `:132-133`) |
| Plagiarisme | Oracle mock | Tidak ditemukan | Tidak ditemukan |
| DOI, komentar, katalog jurnal | Ada | Tidak ditemukan di kontrak | Hanya string `journalName` |
| ZK | Tidak ada | Hanya rancangan laporan, kontrak tidak memuat verifier (grep hanya kena berkas evaluasi) | Tidak ada |
| Peran on-chain | AccessControl, 7 peran | `admin` dan `sessionManager` (`PublicationSessions.sol:14-22`) | `Ownable` (`IncentiveEngine.sol:22`, `:108`) |
| Solidity | 0.8.24, viaIR, cancun | 0.8.28 (`[Ciko]/contracts/hardhat.config.ts:9`) | 0.8.24 (`[Hugo]/hardhat.config.ts:12`) |
| Hardhat | 2.x, JS, ethers, plugin upgrades | 3.x, ESM, viem, Ignition (`[Ciko]/contracts/package.json`) | 2.x, TS, ethers |
| OpenZeppelin | ^5.1.0 | ^5.6.1 | ^5.1.0 |
| Backend | Go Gin, 4.190 baris | NestJS, viem, 3.152 baris non-spec | Express, ts-node, `server/index.ts` 1.125 baris dan `middleware/` |
| Penyimpanan berkas | Pinata | Filesystem lokal (`[Ciko]/README.md:283`) | Tidak ada |
| Port default | Frontend 3000, backend 3001 | 3000 (`[Ciko]/server/src/main.ts:24`) | 3000 (`[Hugo]/server/index.ts:1118`) |

### Fitur Roihan yang BERTENTANGAN dengan triple-blind

Acuan Ciko: penulis, penelaah, dan editor saling tidak tahu (Tabel III.4, `TA_Ciko` PDF hal. 56); identitas riil dan dokumen plaintext tidak menyentuh DLT (`[Ciko]/README.md:285`).

| # | Temuan | Bukti | Tingkat | Sikap integrasi (inferensi) |
|---|---|---|---|---|
| 1 | Naskah tidak dianonimkan, PDF asli langsung ke IPFS publik | `author/submit/page.tsx:80-87` | Fatal | Ganti dengan P01-P04 Ciko |
| 2 | Judul, abstrak, jurnal, CID plaintext on-chain | `PublicationRegistry.sol:158`, `:229-230`, `submit/page.tsx:100-104` | Fatal | Simpan hash dan URI anonim saja |
| 3 | Daftar publik memuat naskah semua status beserta CID dan judul | `handler/article.go:79`, `tracker/page.tsx:47` | Tinggi | Batasi proyeksi publik per status seperti `[Ciko]/server/src/public/public.controller.ts` |
| 4 | Pemetaan terpusat `user_id` ke alamat sesi penulis | `005_session_wallets.up.sql:5-11`, `session_wallet.go:49-57` | Tinggi | Ganti commitment dan simulasi ZK |
| 5 | Pemetaan penelaah ke wallet asli dan kunci privat plaintext | `005_session_wallets.up.sql:16-26`, `session_wallet.go:108-116`, `session_wallet.go:27` | Fatal | Kunci dibangkitkan klien, backend tidak boleh menyimpan |
| 6 | Wallet asli penelaah beserta bidangnya tercatat on-chain | `handler/editor.go:110`, `PublicationRegistry.sol:286-293` | Tinggi | Simpan commitment atau simulasi kredensial |
| 7 | Tarik dana menautkan wallet utama dengan alamat sesi. Digabung dengan nomor 6, penelaah dapat dikaitkan ke naskah | `wallet.ts:340-367`, `earnings/page.tsx:127-133` | Tinggi | Melanggar perlindungan penelaah FR-08 dan F19 Ciko |
| 8 | Pendanaan dompet sesi penulis dari wallet utama | `wallet.ts:279-300` | Sedang saat ini, **Fatal bila di muka** | Hanya terjadi setelah ACCEPTED sekarang. Dengan escrow Hugo terjadi sebelum review |
| 9 | Editor melihat email dan wallet calon penelaah | `verification.go:83-84`, `editor/page.tsx:225`, `:237` | Sedang | Jalur B06. Anonimkan antrian atau pisahkan peran verifikator |
| 10 | Editor tanpa pseudonim dan bukti on-chain | `PublicationRegistry.sol:259-267`, `verification.go:285-298` | Sedang | Pakai `assignEditor` dan `AssignmentProofs` Ciko |
| 11 | Pembukaan identitas dilakukan backend sepihak, termasuk email dan wallet | `handler/article.go:53-57`, `:96-98`, `:167-170`, `identity.go:24-42` | Sedang | Kebijakannya sejalan F19 Ciko, mekanismenya tidak (lihat bawah) |
| 12 | Teks ulasan di calldata sebelum semua penelaah selesai | `PublicationRegistry.sol:314` | Sedang | Pakai commit-reveal Ciko |
| 13 | Penulis dapat terpilih menelaah naskahnya sendiri | `session_wallet.go:65-73` | Sedang | Tambah pengecualian tanpa membuka identitas |
| 14 | Email komentator dibuka publik | `identity.go:46-58`, `handler/article.go:238` | Rendah | Tampilkan alamat atau nama samaran |

**Catatan penyeimbang.** Pembukaan identitas penulis bukan bentrok konseptual. Ciko juga membuka identitas penulis setelah terbit dan saat ditolak, dan tetap melindungi penelaah (F19, `TA_Ciko` PDF hal. 64, 103-104). Bedanya:
- Ciko memakai selective disclosure oleh penulis melalui ZKP (PDF hal. 86, 104).
- Roihan membuka otomatis oleh server, sudah sejak ACCEPTED, dan termasuk desk reject, yang di Ciko mengikuti kebijakan jurnal (PDF hal. 98).

**Yang tidak melanggar:** Tabel `users` memang mengaitkan wallet dengan email, tetapi email tidak pernah dikirim ke chain. Masalahnya ada pada keterhubungan pemetaan di nomor 4 dan 5, bukan pada adanya akun itu sendiri.

### Fitur yang benar-benar komplementer

| Fitur Roihan | Alasan komplementer | Bukti |
|---|---|---|
| Frontend peran dan alur | Ciko tidak punya, Hugo lebih sederhana | `frontend/src/app/` |
| Akun operasional dan peran (dengan pemisahan dari pseudonim) | Ciko tanpa auth | `usecase/auth.go`, `middleware/jwt.go` |
| Katalog jurnal dan kategori | Tidak ada pada Ciko dan Hugo | `013_journals.up.sql` |
| Pencocokan editor per kategori | Ciko hanya mencatat assignment, pilihan datang dari luar | `verification.go:285-298` |
| Verifikasi bidang penelaah | Sumber kandidat bagi `ReviewerSelections` Ciko | `verification.go:58-183` |
| Pemeriksaan plagiarisme lewat oracle | Tidak ditemukan di Ciko dan Hugo | `oracle/src/plagiarism.js` |
| DOI NFT dan komentar pembaca | Tidak ditemukan di Ciko dan Hugo, mengisi pascapublikasi | `DOIToken.sol` |
| Panel open review per versi | Mengisi laporan anonim F20 Ciko | `OpenReviewPanel.tsx`, `manuscript_reader.go:478-583` |
| Pembaca log on-chain berjendela | Berguna untuk riwayat audit | `chainquery/logs.go:36-130` |
| Relay bertanda tangan EIP-712 | Ciko menulis dengan kunci server tanpa tanda tangan pengguna (`[Ciko]/server/src/flows/flows.service.ts:30`, `:48`) | `PublicationRegistry.sol:214-223` |
| Compose dan CI | Tidak ditemukan pada Ciko dan Hugo | `docker-compose.yml`, `.github/workflows/ci.yml` |

### Bentrok mekanisme selain anonimitas

- **Pembayaran.** Roihan membayar setelah ACCEPTED dengan nominal tetap. Hugo di muka dan proporsional. Sesuai prioritas Anda, mekanisme Hugo menang, sehingga `payPublicationFee` dan `JournalToken` keluar dari alur utama.
- **Penetapan penelaah.** `createBatch` Hugo menerima daftar penelaah dari penulis saat deposit (`IncentiveEngine.sol:72-87`, `[Hugo]/frontend/author.ts:49`). Ini bertentangan dengan pemilihan buta Ciko dan oracle Roihan. Kontrak Hugo perlu dipisah menjadi deposit dan penetapan penelaah.
- **Reputasi.** SBT di-mint ke alamat penelaah (`IncentiveEngine.sol:161`). Dengan alamat per naskah, q4 tidak terakumulasi. Mint ke alamat permanen menautkan penelaah dengan naskah.
- **Partisipasi.** Hugo punya `participated` untuk no-show (`IncentiveEngine.sol:103-108`), Roihan menunggu semua suara.
- **Bahasa backend.** Tiga backend berbeda. Modul QoS Hugo TypeScript. Kontrak Ciko diakses viem dari NestJS.

## 11. Yang layak dipakai ulang untuk integrasi dan risiko

Kolom "penyesuaian" pada tabel ini seluruhnya inferensi saya.

### Frontend

| Berkas | Penyesuaian |
|---|---|
| `frontend/src/core/services/wallet.ts` | Pertahankan pembangkitan kunci dan EIP-712. Chain dan domain dari env. Ganti `fundAndPublish` dengan alur escrow Hugo. Hapus `payPublicationFee` mati |
| `frontend/src/core/services/api.client.ts`, `frontend/src/core/context/AuthContext.tsx` | Pakai, tambah penanganan 401 dan env gateway |
| `frontend/src/app/author/submit/page.tsx`, `frontend/src/app/author/revise/page.tsx` | Logika ditulis ulang mengikuti P01-P04 dan revisi minor/mayor Ciko |
| `frontend/src/app/editor/page.tsx` | Sembunyikan email, tampilkan naskah anonim, pakai pseudonim |
| `frontend/src/app/review/[msId]/page.tsx` | Dua langkah commit dan reveal, 4 rekomendasi. Perbaiki teks |
| `frontend/src/app/reviewer/assignments/page.tsx`, `earnings/page.tsx`, `specialization/page.tsx` | Kunci tidak dari backend, saldo ETH dan SBT |
| `frontend/src/app/tracker/*`, `frontend/src/app/articles/*` | Sesuaikan 13 status dan proyeksi publik. Perbaiki bug `metadata` |
| `frontend/src/components/Comments.tsx`, `OpenReviewPanel.tsx` | Hapus tampilan email (`OpenReviewPanel.tsx:211-212`) |
| Hapus | `reviewer/submit`, `reviewer/update`, `articles/[id]/peer-reviews`, `Footer`, hero landing, `GoogleVerifyButton` bila tidak dibutuhkan |

### Backend (dipakai langsung bila Go dipertahankan, atau sebagai rujukan port)

| Berkas | Penyesuaian |
|---|---|
| `backend-go/internal/service/pinata.go` | Ganti adapter IPFS simulasi. Jangan samarkan error. Tambah unduh |
| `backend-go/internal/service/ethereum.go` | Generalisasi multi-kontrak. Pola gas dan decoding error layak dipakai |
| `backend-go/internal/chainquery/*` | ABI baru, jadikan rate limit konfigurasi |
| `backend-go/internal/middleware/*`, `internal/usecase/auth.go`, `internal/handler/auth.go` | Pakai untuk akun operasional |
| `backend-go/internal/repository/verification.go` | Pakai antrian dan `AssignEditor`, sembunyikan identitas dari editor |
| `backend-go/internal/repository/journal.go`, `013_journals.up.sql` | Pakai, satukan daftar bidang |
| `backend-go/internal/repository/comment.go`, bagian komentar `handler/article.go` | Pakai |
| Jangan dipakai apa adanya | `repository/session_wallet.go`, `repository/identity.go`, migrasi 001-012 (ganti satu skema bersih) |

### Oracle dan kontrak

| Berkas | Penyesuaian |
|---|---|
| `oracle/src/provider.js`, `oracle/src/handlers/plagiarism.js` | Pakai pola, tambah backfill event dan retry |
| `oracle/src/plagiarism.js` | Ganti mock dengan simulasi terkendali (mis. skor deterministik yang lolos), sekaligus tempat simulasi q2/q3 bisa ditambahkan terpisah |
| `smartcontract/contracts/DOIToken.sol` | Pakai langsung, MINTER diberikan ke modul publikasi |
| `DOILib` di `PublicationRegistry.sol:26-68` | Ekstrak jadi library, sesuaikan `sessionId` |
| Pola EIP-712 di `PublicationRegistry.sol:214-223` | Terapkan pada aksi pseudonim Ciko |
| `smartcontract/test/helpers.js` | Rujukan pembantu tanda tangan |
| `docker-compose.yml`, `.github/workflows/ci.yml` | Templat, ganti layanan dan tambah test kontrak |
| Tidak dijadikan inti | `PublicationRegistry.sol` (bertumpuk dengan `PublicationSessions` Ciko), `JournalToken.sol` (digantikan ETH escrow), `ReviewOracle.sol` (opsional, hanya untuk plagiarisme) |

### Risiko

| # | Risiko | Dampak | Mitigasi (inferensi) |
|---|---|---|---|
| R1 | Escrow di muka didanai dari wallet asli menautkan penulis ke pseudonim sebelum review | Merusak inti triple-blind | Butuh keputusan, lihat Q1 |
| R2 | Reputasi SBT vs alamat per naskah | q4 Hugo tidak bermakna, atau anonimitas bocor | Butuh keputusan, lihat Q3 |
| R3 | Skor mock 93 menolak semua naskah tanpa Pinata | Demo macet di langkah awal | Simulasi plagiarisme dapat diatur |
| R4 | Jebakan domain EIP-712 di jaringan lokal | Penulis salah tercatat tanpa error | Sumber domain dari env dan verifikasi alamat pulihan |
| R5 | Macet tanpa jalan keluar: event terlewat, penelaah kurang, no-show | Demo end-to-end gagal diam-diam | Backfill, retry, tenggat, dan gating partisipasi |
| R6 | Baca per request dengan batas 2 RPS, list memanggil enumerasi dua kali (`handler/article.go:81`, `:86`) | Halaman daftar lambat seiring jumlah naskah | Rate limit configurable dan cache sederhana |
| R7 | Ketergantungan MetaMask pada bind, bayar, tarik, komentar | Menghalangi demo satu perintah | Penanda tangan dev untuk jaringan lokal |
| R8 | Kunci sesi hanya di localStorage browser | Revisi dan bayar gagal di browser lain | Cukup untuk demo, dokumentasikan |
| R9 | Toolchain Hardhat 2 dan 3, ESM, JS dan TS, Solidity berbeda | Penyatuan kontrak dan test tidak mulus | Satu workspace. Kecocokan plugin upgrades dengan Hardhat 3 belum diperiksa |
| R10 | Migrasi dan seed menimpa saat start, wallet seed milik orang lain | Data demo berubah sendiri | Skema baru, seed dari akun Hardhat |
| R11 | Keamanan: kunci plaintext, CORS `*`, secret default, JWT tanpa validasi, upload tanpa auth | Tidak layak produksi | Dapat diterima untuk demo, catat di dokumen |
| R12 | Laporan dan kode berbeda (bagian 8) | Salah rujuk saat menulis laporan integrasi | Jadikan kode sebagai sumber kebenaran |
| R13 | Bentrok port 3000 antara tiga proyek | Gagal start bersamaan | Tetapkan port di compose terpadu |

### Butuh keputusan Anda sebelum implementasi

Sesuai aturan kerja `CLAUDE.md` tentang konflik besar:

| # | Pertanyaan | Pilihan | Saran saya (inferensi) |
|---|---|---|---|
| Q1 | Siapa yang menyetor escrow di muka tanpa menautkan identitas? | (a) Operator menyetor setelah pembayaran off-chain yang disimulasikan; (b) dompet pseudonim didanai dari pool atau faucet simulasi; (c) terima kebocoran dan catat sebagai batasan | (a) atau (b), keduanya menjaga prioritas Ciko dan cukup sederhana untuk simulasi |
| Q2 | Satu backend atau beberapa? | (a) NestJS sebagai inti, port fitur Go Roihan; (b) Go untuk akun dan katalog, NestJS untuk alur; (c) tiga layanan | (a), karena Ciko prioritas utama, modul Hugo sudah TypeScript, dan logika Go yang perlu diport relatif kecil |
| Q3 | Reputasi SBT disimpan di mana? | (a) Mint ke alamat permanen hanya pascaterbit; (b) tautan via commitment dengan bukti ZK simulasi; (c) per pseudonim tanpa akumulasi | (b) paling selaras dengan rancangan, (a) paling sederhana |
| Q4 | Apakah login email dan password dipertahankan? | (a) Pertahankan, pisahkan total dari pseudonim; (b) ganti akun permanen berbasis wallet dan commitment Ciko | (a) untuk demo yang mudah dicoba per peran |
| Q5 | Fondasi kontrak? | (a) 9 kontrak Ciko, 2 kontrak Hugo, `DOIToken` Roihan; (b) perluas `PublicationRegistry` | (a), sesuai prioritas |

### Daftar path absolut berkas kunci

**Laporan**
- `/home/ihaidar/Projects/DecPub-claude/Roihan/TA_Roihan.pdf`

**Dokumen dan konfigurasi**
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/README.md`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/docker-compose.yml`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/.github/workflows/ci.yml`

**Kontrak**
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/smartcontract/contracts/PublicationRegistry.sol`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/smartcontract/contracts/ReviewOracle.sol`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/smartcontract/contracts/DOIToken.sol`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/smartcontract/contracts/JournalToken.sol`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/smartcontract/scripts/deploy.js`

**Backend**
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/backend-go/cmd/main.go`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/backend-go/internal/service/pinata.go`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/backend-go/internal/service/ethereum.go`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/backend-go/internal/repository/session_wallet.go`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/backend-go/internal/repository/identity.go`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/backend-go/internal/repository/verification.go`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/backend-go/internal/repository/manuscript_reader.go`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/backend-go/internal/db/migrations/005_session_wallets.up.sql`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/backend-go/internal/db/migrations/013_journals.up.sql`

**Oracle**
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/oracle/src/index.js`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/oracle/src/plagiarism.js`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/oracle/src/handlers/reviewer.js`

**Frontend**
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/frontend/src/core/services/wallet.ts`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/frontend/src/app/author/submit/page.tsx`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/frontend/src/app/editor/page.tsx`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/frontend/src/app/review/[msId]/page.tsx`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/frontend/src/app/tracker/[id]/page.tsx`
- `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/frontend/src/components/OpenReviewPanel.tsx`

**Pembanding**
- `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/contracts/contracts/PublicationSessions.sol`
- `/home/ihaidar/Projects/DecPub-claude/Hugo/ojs-incentive-main/contracts/IncentiveEngine.sol`
