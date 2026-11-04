# Analisis Codebase Ciko

> **Catatan.** Dokumen ini hasil baca statis laporan dan kode oleh subagent. Kodenya belum dijalankan. Bagian "keputusan yang perlu ditanyakan" dan usulan bertanda inferensi sudah dijawab atau digantikan: keputusan final ada di [`docs/arsitektur.md`](../arsitektur.md).

**Konvensi rujukan.** Laporan dan spesifikasi dibaca utuh. Kode tidak dijalankan: tidak ada install, compile, deploy, atau tes. Klaim tentang perilaku runtime adalah hasil membaca kode.

| Alias | Path absolut |
|---|---|
| `$CIKO` | `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main` |
| `$K` | `$CIKO/contracts/contracts` |
| `$I` | `$CIKO/contracts/contracts/interfaces` |
| `$S` | `$CIKO/server/src` |
| `$HUGO` | `/home/ihaidar/Projects/DecPub-claude/Hugo/ojs-incentive-main` |
| `$ROIHAN` | `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main` |

- `Lap. hlm. N` merujuk nomor tercetak `/home/ihaidar/Projects/DecPub-claude/Ciko/TA_Ciko.pdf` (halaman PDF = N + 20 untuk bab isi).
- `Spek hlm. N` merujuk `$CIKO/docs/Spesifikasi Mekanisme Anonimitas Triple-Blind Peer Review.pdf`.
- Tag sumber: **[K]** fakta kode, **[L]** fakta laporan, **[S]** fakta spesifikasi, **[I]** inferensi saya.

**Temuan utama untuk integrasi:**

1. **[K]** Di kode tidak ada ZK sama sekali. Tidak ada sirkuit, verifier, atau autentikasi.
2. **[I]** Pseudonim dapat ditautkan ke akun permanen dari data on-chain, karena commitment yang sama muncul di dua event publik (lihat bagian 7).
3. **[I]** Alur server tidak bisa selesai melawan kontrak sungguhan. Tidak ada endpoint untuk `AssigningReviewers -> UnderReview` maupun untuk revisi. Tes e2e tidak mendeteksinya karena memakai mock.
4. **[K]** Kontrak mewajibkan hash anonim saat P02, padahal rancangan mencatatnya saat P04.
5. **[K]** Satu commitment hanya bisa dipakai sekali seumur sistem, sehingga satu akun permanen hanya bisa ikut satu sesi.

## 1. Tujuan

**Tujuan penelitian [L].** Menyusun mekanisme anonimitas berbasis triple-blind peer review untuk publikasi ilmiah terbuka berbasis DLT, sehingga peluang bias identitas berkurang hingga tingkat editor, sambil menjaga transparansi, akuntabilitas, desentralisasi, dan imutabilitas (Lap. hlm. 3).

**Kontribusi yang diklaim [L].** Kombinasi pseudonim ephemeral, pola stealth address, dan commit-reveal. Kredensial anonim berbasis ZKP dirancang konseptual dan integrasinya belum direalisasikan penuh (Lap. hlm. v).

**Perangkat analisis [L, S]:**

- 8 jalur bias B01-B08 (Lap. hlm. 30; Spek hlm. 7).
- 4 properti NF01-NF04: unlinkability, unobservability, unforgeability, auditability (Lap. hlm. 47; Spek hlm. 6).
- 20 kebutuhan fungsional F01-F20 (Lap. hlm. 42-44; Spek hlm. 19-20).
- 4 kelas data D01-D04 (Lap. hlm. 67-68; Spek hlm. 8-9).

**Di luar cakupan [L, S]:**

- Sistem insentif, manajemen jurnal, dan algoritma pemilihan editor serta penelaah.
- Pengecekan konflik kepentingan berbasis identitas.
- Metode penghapusan identitas pada konten teks, dan penanganan penolakan tugas (Lap. hlm. 4-5; Spek hlm. 22).

**Batas klaim [L].** Hasil membuktikan pembatasan struktural informasi identitas, bukan penurunan perilaku bias secara empiris (Lap. hlm. v).

**Pemetaan tahap.** Permintaan integrasi memakai 9 tahap, sedangkan Ciko memakai 8 kode. Proses telaah dan keputusan akhir sama-sama P07, tetapi dibahas pada subbab terpisah (Lap. hlm. 80-84).

| Tahap integrasi | Kode Ciko |
|---|---|
| 1 Pra-pengajuan | P01 |
| 2 Pengajuan manuskrip | P02 |
| 3 Pengecekan | P03 |
| 4 Penghapusan identitas | P04 |
| 5 Penyaringan editorial | P05 |
| 6 Pemilihan penelaah | P06 |
| 7 Proses telaah | P07 (IV.3.7) |
| 8 Keputusan akhir | P07 lanjutan (IV.3.8) |
| 9 Pasca publikasi | P08 |

## 2. Arsitektur

**Rancangan [L]** terdiri dari lima komponen (Lap. hlm. 63-64). Spek hlm. 11 menyebut "empat komponen" tetapi tabelnya berisi lima baris.

**Implementasi [K, L]** hanya mencakup server dan kontrak. Data store penuh dan UI dikeluarkan dari cakupan (Lap. hlm. 88, 94-95).

```text
RANCANGAN
Web & Mobile UI --> Compute Server --> On-Chain DLT (D04)
                        |--> Public DataStore  (D02, D03)
                        '--> Private DataStore (D01, terenkripsi)

IMPLEMENTASI
Klien HTTP / Swagger (tanpa autentikasi)
        |
NestJS :3000 --satu wallet SERVER_PRIVATE_KEY--> 9 kontrak (lokal atau Sepolia)
        |
server/storage/manuscripts/ (plaintext, publik dan privat tidak dipisah)
```

**Empat lapisan identitas [S, Spek hlm. 5]:**

| Lapisan | Isi | Visibilitas |
|---|---|---|
| Identitas asli | Nama, afiliasi, surel, wallet asli | Sangat privat |
| Akun permanen on-chain | Alamat DLT + identity commitment | Sistem saja |
| Pseudonim ephemeral | Alamat sementara per sesi per peran | Sesama peserta sesi |
| Profil off-chain publik | Nama, afiliasi, keahlian, kontribusi agregat | Publik, tanpa pemetaan ke akun on-chain |

**Model kepercayaan:**

- **[L]** Compute Server tepercaya dan mengetahui pemetaan identitas (Lap. hlm. 95).
- **[S]** Spek hlm. 6 menyatakan NF01 sebagai "tidak ada pihak" yang dapat mengaitkan. Ini lebih kuat daripada model kepercayaan implementasi.
- **[K]** Semua transaksi tulis ditandatangani satu akun server (`$S/blockchain/blockchain.service.ts:35`, `$S/contracts/contracts.service.ts:105-114`).
- **[I]** Pseudonim tidak pernah menandatangani apa pun di on-chain. Pseudonim hanya berupa nilai alamat. Ini menguntungkan unobservability pengirim, tetapi otorisasi per peserta tidak ada.

## 3. Teknologi dan komponen

**Versi (dari `package.json`) [K]:**

| Bagian | Komponen | Versi deklarasi | Rujukan |
|---|---|---|---|
| Kontrak | Hardhat | `^3.4.5` (`bun.lock`: 3.4.5) | `$CIKO/contracts/package.json:25` |
| Kontrak | hardhat-toolbox-viem | `^5.0.5` | `$CIKO/contracts/package.json:22` |
| Kontrak | hardhat-ignition | `^3.1.5` | `$CIKO/contracts/package.json:21` |
| Kontrak | viem | `^2.47.6` (`bun.lock`: 2.49.3) | `$CIKO/contracts/package.json:29` |
| Kontrak | TypeScript | `~5.8.0` | `$CIKO/contracts/package.json:28` |
| Kontrak | OpenZeppelin | `^5.6.1`, tidak diimpor kontrak mana pun | `$CIKO/contracts/package.json:32` |
| Kontrak | Solidity | pragma `^0.8.28`, solc 0.8.28 | `$CIKO/contracts/hardhat.config.ts:9,12` |
| Server | NestJS common/core | `^11.0.17` / `^11.0.1` | `$CIKO/server/package.json:41,43` |
| Server | platform-express | `^11.1.11` | `$CIKO/server/package.json:44` |
| Server | swagger / config | `^11.4.4` / `^4.0.4` | `$CIKO/server/package.json:45,42` |
| Server | viem | `^2.52.2` | `$CIKO/server/package.json:53` |
| Server | pdf-lib | `^1.17.1` | `$CIKO/server/package.json:49` |
| Server | multer | `^2.2.0` | `$CIKO/server/package.json:48` |
| Server | class-validator | `^0.15.1` | `$CIKO/server/package.json:47` |
| Server | zod | `^4.4.3`, tidak diimpor di `server/src` | `$CIKO/server/package.json:54` |
| Server | Jest | `^29.7.0` | `$CIKO/server/package.json:73` |
| Server | Node | `>=20.0.0` (README menyebut v18+) | `$CIKO/server/package.json:38`, `$CIKO/README.md:128` |

**Hardhat networks [K]:** `hardhatMainnet`, `hardhatOp`, dan `sepolia` lewat keystore (`$CIKO/contracts/hardhat.config.ts:26-41`).

**Modul NestJS [K]** (`$S/app.module.ts`):

| Modul | Fungsi | File |
|---|---|---|
| `AppModule` | Komposisi, health check | `$S/app.module.ts`, `$S/app.service.ts` |
| `BlockchainModule` | Klien viem public dan wallet | `$S/blockchain/blockchain.service.ts` |
| `ContractsModule` | Muat ABI dari artifact, `read`, `write` | `$S/contracts/contracts.service.ts` |
| `FlowsModule` | Endpoint tulis P02-P08 | `$S/flows/flows.controller.ts`, `$S/flows/flows.service.ts`, `$S/flows/flows.dto.ts` |
| `QueryModule` | Proyeksi baca on-chain | `$S/query/query.service.ts` |
| `PublicModule` | Proyeksi publik dan audit trail | `$S/public/public.controller.ts` |
| `ManuscriptsModule` | Intake PDF, pengecekan, anonimisasi | `$S/manuscripts/` |

- **Tanpa entity atau DB [K].** Tidak ada ORM, entity, atau database (`typeorm`, `prisma`, `mongoose`, `@Entity`: tidak ditemukan). Lap. hlm. 102 menyebut `EvaluationModule`, tetapi modul itu tidak ada. `$S/evaluation` hanya berisi spec dan utilitas.
- **Frontend: tidak ada [K, L].** Tidak ditemukan `.tsx`, `next.config`, atau `index.html`. Interaksi lewat Swagger (Lap. hlm. 94).

**Endpoint [K]:**

| Metode dan path | Baris | Aksi |
|---|---|---|
| `GET /health` | `$S/app.controller.ts:11` | Status RPC dan alamat kontrak |
| `POST /manuscripts/intake` | `$S/manuscripts/manuscripts.controller.ts:22` | Simpan berkas, hitung hash |
| `GET /manuscripts/:id/manifest` | `$S/manuscripts/manuscripts.controller.ts:48` | Manifes, termasuk nama dan surel |
| `POST /manuscripts/automatic-check` | `$S/manuscripts/manuscripts.controller.ts:81` | Pengecekan off-chain |
| `POST /manuscripts/:id/anonymize` | `$S/manuscripts/manuscripts.controller.ts:66` | Anonimisasi off-chain |
| `GET /manuscripts/demo/sample` | `$S/manuscripts/manuscripts.controller.ts:105` | PDF contoh |
| `POST /flows/ephemeral-account` | `$S/flows/flows.controller.ts:27` | `createEphemeral` |
| `POST /flows/submission` | `$S/flows/flows.controller.ts:37` | `createSession` |
| `POST /flows/automatic-checks` | `$S/flows/flows.controller.ts:49` | `recordAutomaticCheck` |
| `POST /flows/anonymization` | `$S/flows/flows.controller.ts:68` | `updateStatus(5)` |
| `POST /flows/assign-editor` | `$S/flows/flows.controller.ts:85` | `assignEditor` |
| `POST /flows/editorial-screening` | `$S/flows/flows.controller.ts:96` | `recordEditorialScreening` |
| `POST /flows/reviewer-selection` | `$S/flows/flows.controller.ts:124` | `recordSelectionBatch` |
| `POST /flows/assignment-proofs/editor` | `$S/flows/flows.controller.ts:141` | `recordEditorAssignmentProof` |
| `POST /flows/assignment-proofs/reviewers` | `$S/flows/flows.controller.ts:149` | `batchRecordReviewerAssignmentProofs` |
| `GET /flows/helper/commitment/:sessionId/:pseudonym/:salt` | `$S/flows/flows.controller.ts:168` | Hitung commitment penugasan |
| `POST /flows/reviews/phase` | `$S/flows/flows.controller.ts:179` | `setReviewPhase` |
| `POST /flows/reviews/commit` | `$S/flows/flows.controller.ts:189` | `commitReview` |
| `POST /flows/reviews/reveal` | `$S/flows/flows.controller.ts:198` | `revealReview` |
| `POST /flows/review-decisions/decide` | `$S/flows/flows.controller.ts:226` | `decideBatch` |
| `POST /flows/publication/finalize` | `$S/flows/flows.controller.ts:258` | `updateStatus(12)` |
| `GET /flows/...` (baca) | `$S/flows/flows.controller.ts:58,78,106,114,134,158,207,216,236,248` | Baca status dan rekam |
| `GET /contracts/status`, `GET /sessions/:id...` | `$S/query/query.controller.ts:11-85` | Proyeksi on-chain |
| `GET /public/sessions/:id` | `$S/public/public.controller.ts:12` | Sama dengan `public-view` |
| `GET /public/sessions/:id/audit-trail` | `$S/public/public.controller.ts:21` | Snapshot terbaru per fase |

## 4. Smart contract

**Ciri bersama [K]:**

- Setiap kontrak memiliki interface sendiri di `$I`.
- Tidak ada proxy. Referensi antarkontrak bersifat `immutable`.
- Semua tulis melewati `onlySessionManager`, kecuali `PermanentAccounts` (hanya `onlyAdmin` dan `register` publik).
- Admin adalah deployer.

**Hubungan dan pola deployment [K]** (`$CIKO/contracts/ignition/modules/FullSystem.ts:7-30`):

```text
PermanentAccounts
  '-> EphemeralAccounts(perm)
        '-> PublicationSessions(eph)
              |-> AutomaticChecks(pub)
              |-> EditorialScreenings(eph, pub)
              |-> ReviewerSelections(pub)
              '-> AssignmentProofs(eph, pub)
                    '-> ReviewSubmissions(eph, pub, assign)
                          '-> ReviewDecisions(pub, reviewSub)
```

**Otorisasi tidak dibuat Ignition [K]:**

- `FullSystem.ts` tidak memiliki `m.call`.
- Journal Sepolia berisi 9 deployment dan 0 `setSessionManager` (`$CIKO/contracts/ignition/deployments/sepolia-full-system-v1/journal.jsonl`).
- Urutan yang benar hanya terlihat di tes (`$CIKO/contracts/test/FullFlow.test.ts:147-180`). Tidak ada skrip wiring. Setelah deploy baru, panggilan server akan gagal `OnlySessionManager` **[I]**.

**Izin yang harus diberikan [K, dari tes]:**

- Akun server pada 8 kontrak, yaitu semua kecuali `PermanentAccounts`.
- `AutomaticChecks`, `EditorialScreenings`, dan `ReviewDecisions` sebagai session manager pada `PublicationSessions`, karena ketiganya memanggil `updateStatus`.

### PermanentAccounts (`$K/PermanentAccounts.sol`, interface `$I/IPermanentAccounts.sol`)

| State | Tipe | Baris |
|---|---|---|
| `admin` | `address immutable` publik | 7 |
| `_accounts` | `address => PermanentAccount {exists, registeredAt, identityCommitment}` | 9 |
| `_usedCommitments` | `bytes32 => bool` | 10 |

| Fungsi | Akses | Baris | Catatan |
|---|---|---|---|
| `register(commitment)` | Publik, `msg.sender` | 21 | Registrasi mandiri |
| `adminRegister(account, commitment)` | `onlyAdmin` | 25 | |
| `adminBatchRegister(accounts, commitments)` | `onlyAdmin` | 32 | Dipakai skrip seed |
| `getMyAccount`, `getAccount` | `view` | 46, 50 | Revert bila belum terdaftar |
| `isRegistered`, `getIdentityCommitment`, `isCommitmentUsed` | `view` | 54, 58, 62 | |
| `_register` | internal | 71 | Validasi dan unik alamat serta commitment |

- **Event:** `PermanentAccountRegistered(account, identityCommitment, registeredAt)`. Alamat dan commitment terlihat publik.
- **Error:** `OnlyAdmin`, `InvalidAccount`, `InvalidCommitment`, `ArrayLengthMismatch`, `AccountAlreadyRegistered`, `CommitmentAlreadyUsed`, `AccountNotRegistered`.

### EphemeralAccounts (`$K/EphemeralAccounts.sol`, interface `$I/IEphemeralAccounts.sol`)

| State | Tipe | Baris |
|---|---|---|
| `_admin` | `address` | 8 |
| `_permanentAccounts` | `IPermanentAccounts immutable` | 9 |
| `_accounts` | `address => EphemeralAccount {exists, role, sessionId, identityCommitment, createdAt, revoked}` | 11 |
| `_sessionManagers` | `address => bool` | 12 |
| `_usedCommitmentsInSession` | `bytes32 => bool` | 13 |
| `_usedPseudonymsInSession` | `bytes32 => bool` | 14 |
| `_usedCommitmentsGlobal` | `bytes32 => bool` | 15 |

Enum `Role`: `Author=0`, `Reviewer=1`, `Editor=2` (`$I/IEphemeralAccounts.sol:5-9`).

| Fungsi | Akses | Baris | Catatan |
|---|---|---|---|
| `setSessionManager` | `onlyAdmin` | 32 | Tanpa event |
| `revokeEphemeral(pseudonym)` | `onlyAdmin` | 36 | Tidak ada endpoint server |
| `createEphemeral(pseudonym, sessionId, role, commitment)` | `onlySessionManager` | 43 | Commitment wajib terdaftar di `PermanentAccounts` dan belum dipakai global (53-55) |
| `admin`, `isSessionManager`, `isActive`, `exists`, `getAccount` | `view` | 85-107 | `getAccount` mengembalikan commitment |
| `isCommitmentUsedInSession`, `isPseudonymUsedInSession`, `isCommitmentUsedGlobally` | `view` | 109-128 | |

- **Event:** `EphemeralAccountCreated(pseudonym, sessionId, role, identityCommitment, createdAt)`, `EphemeralAccountRevoked(pseudonym, sessionId, revokedAt)`.
- **Error:** `OnlyAdmin`, `OnlySessionManager`, `PseudonymAlreadyExists`, `CommitmentAlreadyUsedInSession`, `CommitmentAlreadyUsedGlobally`, `InvalidCommitment`, `InvalidPseudonym`, `InvalidSession`, `AccountNotFound`, `AccountRevoked`, `PermanentAccountNotRegistered`.
- **[I]** `AccountRevoked` tidak dipakai. Pemeriksaan keunikan per sesi pada baris 60-61 tidak pernah menjadi penyebab revert, karena pemeriksaan global dan keberadaan pseudonim lebih dulu pada baris 52-53.

### PublicationSessions (`$K/PublicationSessions.sol`, interface `$I/IPublicationSessions.sol`)

| State | Tipe | Baris |
|---|---|---|
| `_admin` | `address` | 8 |
| `_ephemeralAccounts` | `IEphemeralAccounts immutable` | 9 |
| `_sessions` | `bytes32 => PublicationSession` | 11 |
| `_sessionManagers` | `address => bool` | 12 |

Field `PublicationSession` (`$I/IPublicationSessions.sol:21-35`): `exists`, `sessionId`, `authorPseudonym`, `editorPseudonym`, `originalManuscriptHash`, `anonymizedManuscriptHash`, `metadataHash`, `anonymizedManuscriptURI`, `metadataURI`, `status`, `createdAt`, `updatedAt`, `revisionCount`.

| Fungsi | Akses | Baris | Catatan |
|---|---|---|---|
| `setSessionManager` | `onlyAdmin` | 34 | Tanpa event |
| `createSession(...)` | `onlySessionManager` | 38 | Hash anonim wajib bukan nol (50), pseudonim harus Author aktif pada sesi ini |
| `assignEditor(sessionId, editorPseudonym)` | `onlySessionManager`, `sessionMustExist` | 90 | Status wajib `UnderEditorialScreening`, sekali per sesi |
| `updateStatus(sessionId, newStatus)` | `onlySessionManager`, `sessionMustExist` | 112 | Lewat `_isValidTransition` |
| `recordRevision(...)` | `onlySessionManager`, `sessionMustExist` | 119 | Hanya dari Minor atau Major, langsung pindah status |
| `recordReviewerCriteria(sessionId, hash, count)` | `onlySessionManager`, `sessionMustExist` | 170 | Hanya event, tanpa state; tidak ada endpoint server |
| `admin`, `isSessionManager`, `exists`, `getSession` | `view` | 195-210 | |
| `_updateStatusInternal`, `_isValidTransition` | internal | 212, 224 | Mesin status |

- **Event:** `PublicationSessionCreated`, `PublicationStatusUpdated`, `EditorAssigned`, `ManuscriptRevisionRecorded`, `ReviewerCriteriaRecorded`.
- **Error:** `OnlyAdmin`, `OnlySessionManager`, `SessionAlreadyExists`, `SessionNotFound`, `InvalidSessionId`, `InvalidPseudonym`, `InvalidHash`, `InvalidStatus`, `InvalidReviewerCount`, `UnauthorizedRole`, `InvalidStatusTransition`, `EditorAlreadyAssigned`.

### AutomaticChecks (`$K/AutomaticChecks.sol`, interface `$I/IAutomaticChecks.sol`)

| State | Tipe | Baris |
|---|---|---|
| `_admin`, `_publicationSessions`, `_sessionManagers` | Admin, referensi, otorisasi | 8, 9, 11 |
| `_latestBatch` | `bytes32 => uint32` | 12 |
| `_records` | `bytes32 => uint32 => AutomaticCheckRecord` | 13 |

Hasil: `None`, `Pass`, `Incomplete`, `Reject` (`$I/IAutomaticChecks.sol:5-10`).

| Fungsi | Akses | Baris | Catatan |
|---|---|---|---|
| `setSessionManager` | `onlyAdmin` | 36 | Emit event |
| `recordAutomaticCheck(sessionId, reportHash, flagsHash, reportURI, result)` | `onlySessionManager`, `sessionMustExist` | 41 | Status wajib Submitted, UnderAutomaticChecking, atau Incomplete; memindahkan status |
| `admin`, `isSessionManager`, `getLatestBatch`, `hasRecord`, `getRecord`, `getLatestRecord` | `view` | 97-125 | |

- **Event:** `SessionManagerUpdated`, `AutomaticCheckRecorded`.
- **Error:** `OnlyAdmin`, `OnlySessionManager`, `SessionNotFound`, `InvalidSessionId`, `InvalidHash`, `InvalidResult`, `InvalidBatch`, `RecordNotFound`, `InvalidSessionStatus`.

### EditorialScreenings (`$K/EditorialScreenings.sol`, interface `$I/IEditorialScreenings.sol`)

| State | Tipe | Baris |
|---|---|---|
| `_admin`, `_publicationSessions`, `_ephemeralAccounts`, `_sessionManagers` | Admin, referensi, otorisasi | 9, 10, 11, 13 |
| `_records` | `bytes32 => uint32 revision => EditorialScreeningRecord` | 14 |

Keputusan: `None`, `ProceedToReviewerSelection`, `ReviseBeforeReview`, `DeskReject` (`$I/IEditorialScreenings.sol:5-10`).

| Fungsi | Akses | Baris | Catatan |
|---|---|---|---|
| `setSessionManager` | `onlyAdmin` | 38 | |
| `recordEditorialScreening(...)` | `onlySessionManager`, `sessionMustExist` | 43 | Satu rekam per revisi; `ReviseBeforeReview` menjadi `MajorRevisionRequired` (102-106) |
| `admin`, `isSessionManager`, `hasRecord`, `getRecord`, `getLatestRecord` | `view` | 115-143 | |

- **Event:** `SessionManagerUpdated`, `EditorialScreeningRecorded`.
- **Error:** `OnlyAdmin`, `OnlySessionManager`, `SessionNotFound`, `InvalidSessionId`, `InvalidPseudonym`, `InvalidHash`, `InvalidDecision`, `InvalidSessionStatus`, `UnauthorizedEditor`, `RecordAlreadyExists`, `RecordNotFound`.

### AssignmentProofs (`$K/AssignmentProofs.sol`, interface `$I/IAssignmentProofs.sol`)

| State | Tipe | Baris |
|---|---|---|
| `_admin`, `_ephemeralAccounts`, `_publicationSessions`, `_sessionManagers` | Admin, referensi, otorisasi | 9, 10, 11, 13 |
| `_editorProofs` | `bytes32 => EditorAssignmentProof` | 14 |
| `_reviewerProofs` | `bytes32 => bytes32 => ReviewerAssignmentProof` | 15 |
| `_reviewerProofCount` | `bytes32 => uint256` | 16 |

| Fungsi | Akses | Baris | Catatan |
|---|---|---|---|
| `setSessionManager` | `onlyAdmin` | 40 | |
| `recordEditorAssignmentProof(sessionId, editorPseudonym, proofRef)` | `onlySessionManager`, `sessionMustExist` | 45 | Sekali per sesi; `proofRef` tidak diverifikasi |
| `recordReviewerAssignmentProof(...)` | `onlySessionManager`, `sessionMustExist` | 85 | Tidak ada endpoint server |
| `batchRecordReviewerAssignmentProofs(...)` | `onlySessionManager`, `sessionMustExist` | 94 | Duplikat commitment ditolak |
| `admin`, `isSessionManager`, `hasEditorAssignmentProof`, `hasReviewerAssignmentProof`, `getEditorAssignmentProof`, `getReviewerAssignmentProof`, `getReviewerAssignmentProofCount` | `view` | 117-155 | |
| `_recordReviewerProof` | internal | 157 | Status UnderEditorialScreening atau AssigningReviewers |

- **Event:** `SessionManagerUpdated`, `EditorAssignmentProofRecorded`, `ReviewerAssignmentProofRecorded`.
- **Error:** `OnlyAdmin`, `OnlySessionManager`, `SessionNotFound`, `InvalidSessionId`, `InvalidPseudonym`, `InvalidCommitment`, `InvalidReference`, `UnauthorizedRole`, `ProofAlreadyExists`, `ProofNotFound`, `EditorMismatch`, `EditorAlreadyRecorded`, `InvalidSessionStatus`, `LengthMismatch`.

### ReviewerSelections (`$K/ReviewerSelections.sol`, interface `$I/IReviewerSelections.sol`)

| State | Tipe | Baris |
|---|---|---|
| `_admin`, `_publicationSessions`, `_sessionManagers` | Admin, referensi, otorisasi | 8, 9, 11 |
| `_latestBatch` | `bytes32 => uint32` | 12 |
| `_batches` | `bytes32 => uint32 => ReviewerSelectionBatch` | 13 |
| `_selected` | `bytes32 => uint32 => bytes32 => SelectedReviewer` | 14 |
| `_selectedCounts` | `bytes32 => uint32 => uint256` | 15 |

| Fungsi | Akses | Baris | Catatan |
|---|---|---|---|
| `setSessionManager` | `onlyAdmin` | 38 | |
| `recordSelectionBatch(sessionId, criteriaHash, reviewerCount, commitments)` | `onlySessionManager`, `sessionMustExist` | 43 | Status wajib `AssigningReviewers`; **tidak** mengubah status; hanya mencatat hasil |
| `admin`, `isSessionManager`, `getLatestBatch`, `hasBatch`, `hasSelection`, `getBatch`, `getSelectedReviewer`, `getSelectedReviewerCount` | `view` | 104-150 | |

- **Event:** `SessionManagerUpdated`, `ReviewerSelectionBatchRecorded`, `ReviewerSelected`.
- **Error:** `OnlyAdmin`, `OnlySessionManager`, `SessionNotFound`, `InvalidSessionId`, `InvalidHash`, `InvalidReviewerCount`, `InvalidCommitment`, `InvalidSessionStatus`, `BatchAlreadyExists`, `BatchNotFound`, `SelectionAlreadyExists`, `LengthMismatch`.

### ReviewSubmissions (`$K/ReviewSubmissions.sol`, interface `$I/IReviewSubmissions.sol`)

| State | Tipe | Baris |
|---|---|---|
| `_admin`, `_publicationSessions`, `_assignmentProofs`, `_ephemeralAccounts`, `_sessionManagers` | Admin, referensi, otorisasi | 10-13, 15 |
| `_phases` | `bytes32 => ReviewPhase` | 16 |
| `_commits` | `bytes32 => address => ReviewCommitRecord` | 17 |
| `_reveals` | `bytes32 => address => ReviewRevealRecord` | 18 |

Rekomendasi: `None`, `Reject`, `MajorRevision`, `MinorRevision`, `AcceptAsIs`. Fase: `None`, `Commit`, `Reveal`, `Closed` (`$I/IReviewSubmissions.sol:5-18`).

| Fungsi | Akses | Baris | Catatan |
|---|---|---|---|
| `setSessionManager` | `onlyAdmin` | 47 | |
| `setReviewPhase(sessionId, phase)` | `onlySessionManager`, `sessionMustExist` | 52 | Status wajib `UnderReview`; urutan fase dan kelengkapan commit tidak diperiksa |
| `commitReview(sessionId, pseudonym, assignmentCommitment, commitHash)` | `onlySessionManager`, `sessionMustExist` | 73 | Satu commit per pseudonim per sesi (99) |
| `revealReview(...)` | `onlySessionManager`, `sessionMustExist` | 115 | Hash dicocokkan (135-138), nonce ikut disimpan |
| `admin`, `isSessionManager`, `getReviewPhase`, `hasCommit`, `hasReveal`, `getCommitRecord`, `getRevealRecord` | `view` | 166-198 | |
| `computeCommitHash(...)` | `pure` | 200 | `keccak256(abi.encode(...))` |

- **Event:** `SessionManagerUpdated`, `ReviewPhaseUpdated`, `ReviewCommitted`, `ReviewRevealed`.
- **Error:** `OnlyAdmin`, `OnlySessionManager`, `SessionNotFound`, `InvalidSessionId`, `InvalidPseudonym`, `InvalidCommitment`, `InvalidHash`, `InvalidRecommendation`, `InvalidSessionStatus`, `InvalidPhase`, `UnauthorizedReviewer`, `CommitAlreadyExists`, `CommitNotFound`, `RevealAlreadyExists`, `InvalidReveal`.
- **[I]** Satu `assignmentCommitment` tidak terikat ke satu pseudonim. Kontrak hanya memeriksa commitment itu pernah tercatat.

### ReviewDecisions (`$K/ReviewDecisions.sol`, interface `$I/IReviewDecisions.sol`)

| State | Tipe | Baris |
|---|---|---|
| `_admin`, `_publicationSessions`, `_reviewSubmissions`, `_sessionManagers` | Admin, referensi, otorisasi | 16-18, 20 |
| `_decisions` | `bytes32 => uint32 => DecisionBatch` | 21 |

| Fungsi | Akses | Baris | Catatan |
|---|---|---|---|
| `setSessionManager` | `onlyAdmin` | 45 | |
| `decideBatch(sessionId, batch, reviewerPseudonyms, additionalIfGrayZone)` | `onlySessionManager`, `sessionMustExist` | 50 | Daftar penelaah diberikan pemanggil; memindahkan status |
| `admin`, `isSessionManager`, `hasDecision`, `getDecision` | `view` | 137-154 | |
| `computeOutcome(...)` | `pure` | 156 | |
| `_collectVotes`, `_computeOutcome` | internal | 166, 198 | Mayoritas absolut `total/2+1`; selain itu gray zone |

- **Event:** `SessionManagerUpdated`, `ReviewBatchDecided`.
- **Error:** `OnlyAdmin`, `OnlySessionManager`, `SessionNotFound`, `InvalidSessionId`, `InvalidSessionStatus`, `InvalidBatch`, `InvalidReviewerCount`, `BatchAlreadyDecided`, `RevealNotFound`, `DuplicateReviewer`, `InvalidOutcome`.
- **[I]** Kontrak tidak mengimpor `ReviewerSelections`. Pemanggil dapat memilih sebagian penelaah, sehingga agregasi tidak mengikat seluruh penelaah yang ditugaskan.

## 5. Alur data

Di semua peran, jalur on-chain sama: klien HTTP, lalu `FlowsService`, `ContractsService.write`, `simulateContract`, `writeContract`, dan menunggu receipt (`$S/contracts/contracts.service.ts:97-128`). Semua transaksi berasal dari satu alamat server.

**Admin atau operator:**

1. Deploy `FullSystem`.
2. Beri izin session manager (manual).
3. Daftarkan akun permanen lewat `$CIKO/contracts/scripts/batch-register.ts:128`.

Skrip menurunkan `identitySecret` dan `identityCommitment` dari private key, lalu menyimpan hasilnya ke `ignition/.credentials.json` (`$CIKO/contracts/scripts/batch-register.ts:33-41,68,96`).

**Penulis:**

1. Unggah PDF dan nama, surel, afiliasi lewat `/manuscripts/intake`. Berkas dan manifes disimpan plaintext.
2. Klien memilih `sessionId` dan alamat pseudonim, lalu mengirim commitment lewat `/flows/ephemeral-account`. Pada on-chain, `createEphemeral` berjalan.
3. Klien mengirim hash dan URI lewat `/flows/submission`. Pada on-chain, `createSession` berjalan dengan status `Submitted`.
4. Klien menjalankan pengecekan, lalu meneruskan hash dan `result` ke `/flows/automatic-checks`.
5. Klien menjalankan anonimisasi off-chain, lalu memanggil `/flows/anonymization` untuk status 5.

**Editor:**

1. Pseudonim editor dibuat oleh pemanggil endpoint.
2. `/flows/assign-editor` dan `/flows/assignment-proofs/editor` mencatat penugasan.
3. Editor mengirim hash laporan, URI, dan keputusan lewat `/flows/editorial-screening`. Laporan tidak diunggah ke server.

**Penelaah:**

1. Pemanggil endpoint mengirim daftar commitment ke `/flows/reviewer-selection` dan `/flows/assignment-proofs/reviewers`.
2. Commit dan reveal lewat `/flows/reviews/*`.
3. Saat commit, rekomendasi dan nonce dikirim plaintext ke server, karena `commitHash` dihitung server (`$S/flows/flows.service.ts:298-331`).

**Sistem atau pemanggil:** `/flows/review-decisions/decide` mengirim daftar pseudonim. Kontrak menghitung suara dan memindahkan status.

**Publik:** `GET /public/sessions/:id` dan `/audit-trail` memanggil `QueryService.getPublicView`. Selain itu siapa pun dapat membaca kontrak dan event melalui RPC.

## 6. Alur publikasi per tahap

### Mesin status manuskrip yang persis

**Enum on-chain [K]** (`$I/IPublicationSessions.sol:5-19`):

| Nilai | Status | Nilai | Status |
|---|---|---|---|
| 0 | `None` | 7 | `MajorRevisionRequired` |
| 1 | `Submitted` | 8 | `AssigningReviewers` |
| 2 | `UnderAutomaticChecking` | 9 | `UnderReview` |
| 3 | `Incomplete` | 10 | `Accepted` |
| 4 | `UnderAnonymization` | 11 | `Rejected` |
| 5 | `UnderEditorialScreening` | 12 | `Published` |
| 6 | `MinorRevisionRequired` | | |

**Transisi [K]** (`$K/PublicationSessions.sol:72,160-165,224-264`):

| Dari | Ke | Dipicu oleh |
|---|---|---|
| `None` | `Submitted` | `createSession` |
| `Submitted` | `UnderAutomaticChecking`, `Incomplete`, `UnderAnonymization`, `Rejected` | `updateStatus` atau `AutomaticChecks` |
| `UnderAutomaticChecking` | `Incomplete`, `UnderAnonymization`, `Rejected` | `updateStatus` atau `AutomaticChecks` |
| `Incomplete` | `UnderAutomaticChecking`, `UnderAnonymization`, `Rejected` | `updateStatus` atau `AutomaticChecks` |
| `UnderAnonymization` | `UnderEditorialScreening`, `Rejected` | `updateStatus`; server hanya ke 5 (`$S/flows/flows.service.ts:113-116`) |
| `UnderEditorialScreening` | `AssigningReviewers`, `MinorRevisionRequired`, `MajorRevisionRequired`, `Rejected` | `EditorialScreenings` (tidak memakai Minor) |
| `AssigningReviewers` | `UnderReview` | `updateStatus` langsung. **Tidak ada endpoint server** |
| `UnderReview` | `MinorRevisionRequired`, `MajorRevisionRequired`, `Accepted`, `Rejected`, `AssigningReviewers` | `ReviewDecisions` |
| `MinorRevisionRequired` | `AssigningReviewers` | Hanya `recordRevision`. **Tidak ada endpoint server** |
| `MajorRevisionRequired` | `UnderEditorialScreening` | Hanya `recordRevision`. **Tidak ada endpoint server** |
| `Accepted` | `Published` | `updateStatus`; server `/flows/publication/finalize` (`$S/flows/flows.service.ts:434-437`) |
| `Rejected`, `Published` | Terminal | |

**Pemicu terkait:**

- Hasil pengecekan `Pass`, `Incomplete`, `Reject` memetakan ke status 4, 3, 11 (`$K/AutomaticChecks.sol:79-94`).
- Keputusan editorial memetakan ke status 8, 7, 11 (`$K/EditorialScreenings.sol:97-112`).
- Gray zone memetakan ke status 8 (`$K/ReviewDecisions.sol:129-134`).

**Perbedaan status antara dokumen dan kode:**

| Status | Laporan | Spesifikasi | Kode |
|---|---|---|---|
| Pengajuan ulang | `Resubmitted` (hlm. 74) | `Resubmitted` (hlm. 14) | Tidak ada |
| P03 | `Under Automatic Checking`, `Incomplete` (hlm. 75) | `Under Review` (hlm. 14) | `UnderAutomaticChecking`, `Incomplete` |
| Revisi desk | `Author Revision Required` (hlm. 78) | Tidak dinamai | `MajorRevisionRequired` |
| Tolak desk | `Desk Rejected` (hlm. 78) | Sesi ditutup (hlm. 17) | `Rejected` |

### Tahap 1. Pra-pengajuan (P01)

- **Aktor:** sistem atau admin, seluruh anggota.
- **Prasyarat:** kontrak ter-deploy dan izin session manager sudah diberikan.
- **Langkah rancangan [S, L]** (Spek hlm. 14; Lap. hlm. 71-73):
  1. Sediakan akun permanen, profil off-chain publik, Public dan Private Data Store, serta kontrak.
  2. Tetapkan kebijakan etika (non-teknis).
- **Aturan keras [S]:** profil tidak memetakan ke akun on-chain; akun permanen tidak memuat peran, profil, atau riwayat.
- **Data masuk dan keluar:** identitas asli dan secret masuk; alamat permanen dan commitment keluar.
- **Tetap rahasia:** `identitySecret` terhadap semua pihak; pemetaan profil ke akun terhadap publik.
- **Jenis akun:** persisten.
- **ZK rancangan:** penerbitan anonymous credential dan autentikasi ZKP, tanpa rincian skema (Lap. hlm. 72).
- **Kontrak dan endpoint:**
  - `$K/PermanentAccounts.sol:21-44`
  - `$CIKO/contracts/scripts/batch-register.ts:128`
  - Endpoint berlabel P01, `POST /manuscripts/intake`, ada di `$S/manuscripts/manuscripts.controller.ts:22`. Fungsinya menurut rancangan termasuk P02 (penyimpanan manuskrip).
- **Status: parsial.**
  - Hanya akun permanen yang ada.
  - Tidak ada endpoint registrasi, profil, data store terpisah, atau kredensial.

### Tahap 2. Pengajuan manuskrip (P02)

- **Aktor:** penulis, sistem.
- **Prasyarat:** penulis terdaftar dan commitment tersedia.
- **Langkah rancangan [S, L]** (Spek hlm. 15; Lap. hlm. 73-74):
  1. Autentikasi ZKP.
  2. Bangkitkan pseudonim ephemeral.
  3. Simpan D01 terenkripsi ke Private Data Store.
  4. Catat pseudonim, hash manuskrip asli, dan hash metadata asli ke ledger.
- **Data masuk:** berkas, judul, nama, surel, afiliasi.
- **Data keluar:** `fileHash`, `metadataHash`, `manuscriptId`, `sessionId`, pseudonim.
- **Tetap rahasia:** identitas penulis terhadap editor, penelaah, dan publik; isi manuskrip asli.
- **Jenis akun:** persisten untuk autentikasi; ephemeral penulis di ledger.
- **ZK rancangan:** bukti keanggotaan dan peran penulis, serta pembangkitan pseudonim yang tidak terhubung (NF01, NF03).
- **Kontrak dan endpoint:**
  - `$K/EphemeralAccounts.sol:43`
  - `$K/PublicationSessions.sol:38`
  - `$S/flows/flows.controller.ts:27,37`
  - `$S/manuscripts/manuscripts.service.ts:16-75`
- **Status: parsial [K, I].**
  - Tanpa autentikasi. Pseudonim dipilih klien. Commitment yang dikirim adalah commitment permanen.
  - Berkas disimpan plaintext (`$S/manuscripts/manuscripts.service.ts:31`).
  - `createSession` mewajibkan hash anonim (`$K/PublicationSessions.sol:50`), sehingga berbeda dari urutan rancangan. Tidak ada kaitan tersimpan antara `manuscriptId` dan `sessionId`.
  - `GET /manuscripts/:id/manifest` membuka nama dan surel tanpa autentikasi (`$S/manuscripts/manuscripts.controller.ts:48-63`).

### Tahap 3. Pengecekan (P03)

- **Aktor:** sistem, tanpa manusia dan tanpa ML/AI.
- **Prasyarat:** sesi `Submitted`, atau `Incomplete` untuk pengecekan ulang.
- **Langkah rancangan [S, L]** (Spek hlm. 15; Lap. hlm. 74-75):
  1. Periksa format, metadata wajib, dan panduan jurnal.
  2. Buat laporan checklist (D03).
  3. Catat hash laporan.
  4. Bila tidak lulus, beri notifikasi ke penulis. Bila lulus, lanjut P04.
- **Data masuk:** berkas atau `manuscriptId`.
- **Data keluar:** `reportHash`, `flagsHash`, `resultCategory`, `reportUri`.
- **Tetap rahasia:** isi manuskrip dan metadata tidak masuk laporan.
- **Jenis akun:** tanpa aktor manusia; dikaitkan ke pseudonim penulis.
- **ZK rancangan:** tidak ada.
- **Kontrak dan endpoint:**
  - `$K/AutomaticChecks.sol:41`
  - `$S/manuscripts/manuscripts-automatic-check.service.ts:24-113`
  - `$S/flows/flows.controller.ts:49`
- **Status: parsial [K].**
  - Pengecekan bersifat deterministik.
  - Abstrak hanya dicek dari metadata PDF `Subject` (`:41,55`).
  - `identityExposed` dihitung tetapi tidak memengaruhi hasil (`:54,60-66`).
  - DOCX diterima intake tetapi ditolak pengecekan (`:46,50,60`).
  - **[I]** `result` di `/flows/automatic-checks` berasal dari klien (`$S/flows/flows.dto.ts:99-101`), sehingga tidak terikat ke hasil pengecekan server.
  - Laporan memakai `file://` (`:82`), bukan penyimpanan publik.
  - Status `Incomplete` tidak punya cara mencatat hash berkas baru. Tes "resubmit" hanya mencatat pengecekan kedua (`$CIKO/contracts/test/FullFlow.test.ts:388-400`).

### Tahap 4. Penghapusan identitas (P04)

- **Aktor:** sistem.
- **Prasyarat:** status `UnderAnonymization`.
- **Langkah rancangan [S, L]** (Spek hlm. 16; Lap. hlm. 75-76):
  1. Hapus nama, afiliasi, surel, dan self-citation.
  2. Buat halaman publik sesi.
  3. Catat hash manuskrip anonim, hash metadata anonim, dan referensi publik.
- **Data masuk:** manuskrip dan metadata asli.
- **Data keluar:** artefak anonim, hash, laporan anonimisasi.
- **Tetap rahasia:** artefak asli terenkripsi; keterkaitan anonim dan asli tidak dicatat di ledger sebelum P08 (Spek hlm. 9).
- **Jenis akun:** tanpa aktor manusia.
- **ZK rancangan:** tidak ada.
- **Kontrak dan endpoint:**
  - `$S/manuscripts/manuscripts-anonymization.service.ts:16-104`
  - `$S/flows/flows.service.ts:105-132`
  - `$K/PublicationSessions.sol:112`
- **Status: parsial dengan celah kritis [K, I].**
  - Hanya metadata PDF yang diganti. Satu halaman sampul disisipkan (`:28-42`), halaman asli tidak disentuh, sehingga nama, afiliasi, dan surel pada isi tetap ada.
  - DOCX dilewatkan apa adanya (`:49-51`).
  - `/flows/anonymization` hanya memanggil `updateStatus(5)`. DTO hash dan URI diabaikan.
  - Tidak ada fungsi kontrak untuk mencatat artefak anonim pada tahap ini.
  - Tidak ada endpoint untuk mengunduh artefak anonim.

### Tahap 5. Penyaringan editorial (P05)

- **Aktor:** sistem, editor.
- **Prasyarat:** status `UnderEditorialScreening`; pseudonim editor ada.
- **Langkah rancangan [S, L]** (Spek hlm. 16-17; Lap. hlm. 76-78):
  1. Pilih editor acak sesuai kompetensi.
  2. Bangkitkan pseudonim editor.
  3. Catat penugasan dan bukti.
  4. Editor menilai D02.
  5. Editor menghasilkan laporan beridentitas, keputusan, dan kriteria penelaah.
  6. Sistem memverifikasi laporan dengan ZKP, lalu membuat laporan anonim ke penyimpanan publik.
- **Tindak lanjut:**
  - Diterima: lanjut P06.
  - Perlu revisi: masuk ulang P03-P04 pada sesi dan editor yang sama.
  - Ditolak: sesi ditutup, asli diarsipkan privat, laporan anonim dipublikasikan.
- **Data masuk:** D02, laporan, keputusan, kriteria.
- **Data keluar:** hash laporan, URI laporan anonim, status, hash kriteria.
- **Tetap rahasia:** identitas penulis terhadap editor; identitas editor terhadap penulis dan penelaah.
- **Jenis akun:** ephemeral editor.
- **ZK rancangan:** bukti penugasan editor; verifikasi laporan dari pseudonim sah.
- **Kontrak dan endpoint:**
  - `$K/PublicationSessions.sol:90,170`
  - `$K/AssignmentProofs.sol:45`
  - `$K/EditorialScreenings.sol:43`
  - `$S/flows/flows.controller.ts:85,96,141`
- **Status: parsial [K].**
  - Pencatatan dan otomatisasi status ada.
  - Pemilihan editor, pembangkitan pseudonim, unggah laporan, anonimisasi laporan, dan verifikasi ZKP tidak ada.
  - `recordReviewerCriteria` tidak punya endpoint.
  - Hash laporan datang dari klien, dan `proofRef` tidak diverifikasi.
- **Perbedaan [L, S, K]:** laporan menyebut revisi desk tidak melewati penyaringan dari awal (Lap. hlm. 78). Spek hanya menyebut masuk ulang P03-P04 (Spek hlm. 17). Kode kembali ke `UnderEditorialScreening` dengan rekam revisi baru dan melewati P03-P04.

### Tahap 6. Pemilihan penelaah (P06)

- **Aktor:** sistem. Editor hanya memberi kriteria.
- **Prasyarat:** status `AssigningReviewers`; kriteria sudah dicatat.
- **Langkah rancangan [S, L]** (Spek hlm. 17; Lap. hlm. 78-79):
  1. Saring kandidat sesuai kriteria, lalu pilih acak.
  2. Bangkitkan pseudonim tiap penelaah.
  3. Kirim undangan melalui stealth address.
  4. Catat komitmen penugasan, referensi undangan, dan bukti.
- **Data masuk:** kriteria, pool penelaah, kunci publik.
- **Data keluar:** `reviewerAssignmentCommitment`, `inviteRef`, `proofRef`, nomor batch.
- **Tetap rahasia:** daftar penelaah terhadap editor dan penulis; identitas penulis terhadap penelaah.
- **Jenis akun:** ephemeral penelaah; alamat stealth sekali pakai untuk undangan.
- **ZK rancangan:** bukti penugasan dan eligibilitas. Stealth address bukan ZK.
- **Kontrak dan endpoint:**
  - `$K/ReviewerSelections.sol:43`
  - `$K/AssignmentProofs.sol:94`
  - `$S/flows/flows.controller.ts:124,149,168`
  - `$S/flows/flows.service.ts:204-266,458-465`
- **Status: pencatatan saja [K].**
  - Seleksi kriteria-acak tidak ada. Daftar commitment berasal dari klien (`$S/flows/flows.service.ts:204-210`).
  - `$CIKO/contracts/README.md:324` menegaskan kontrak hanya menyimpan hasil, bukan logika pemilihan.
  - `inviteRef` hanya `keccak256(sessionId, commitment, proofRef)`, tanpa kunci publik dan tanpa pengiriman undangan.
  - **Blocker:** tidak ada endpoint untuk status 9. Pemanggilan `/flows/reviews/phase` berikutnya akan revert karena status bukan `UnderReview` (`$K/ReviewSubmissions.sol:62-66`).

### Tahap 7. Proses telaah (P07, IV.3.7)

- **Aktor:** penelaah, sistem.
- **Prasyarat:** status `UnderReview`; pseudonim aktif; bukti penugasan tercatat.
- **Langkah rancangan [S, L]** (Spek hlm. 17-18; Lap. hlm. 80-81):
  1. Akses D02 melalui kanal pseudonim.
  2. Hasilkan laporan anonim dan rekomendasi empat kategori.
  3. Commit `hash(rekomendasi + nonce)`.
  4. Sistem menunggu semua commit.
  5. Reveal dan verifikasi kecocokan.
  6. Laporan ke penyimpanan publik.
- **Data masuk:** rekomendasi, `reviewHash`, `reviewURI`, nonce.
- **Data keluar:** `commitHash`, rekam reveal.
- **Tetap rahasia:**
  - Identitas penelaah terhadap penulis dan editor, juga setelah publikasi.
  - Identitas penulis terhadap penelaah.
  - Rekomendasi antarpenelaah sebelum reveal.
- **Jenis akun:** ephemeral penelaah.
- **ZK rancangan:** verifikasi laporan dan komitmen berasal dari pseudonim penelaah sah (NF03).
- **Kontrak dan endpoint:**
  - `$K/ReviewSubmissions.sol:52,73,115`
  - `$S/flows/flows.controller.ts:179,189,198`
  - `$S/flows/flows.service.ts:298-364`
- **Status: inti commit-reveal ada, parsial [K, I].**
  - Isi commit tidak dibuka di ledger. Tetapi server melihat rekomendasi dan nonce saat commit.
  - Kelengkapan commit sebelum reveal tidak ditegakkan oleh kontrak maupun server.
  - Akses ke manuskrip dan unggah laporan tidak ada.
  - Pseudonim tidak menandatangani. Tidak ada verifikasi bahwa pemanggil adalah pemilik pseudonim.
  - Komitmen dan pseudonim tertaut pada `ReviewCommitted` (`$I/IReviewSubmissions.sol:52-58`). Ini berbeda dari Lap. hlm. 79, yang menyatakan identitas penelaah hanya berbentuk komitmen.

### Tahap 8. Keputusan akhir (P07, IV.3.8)

- **Aktor:** sistem, tanpa editor.
- **Prasyarat:** reveal batch selesai.
- **Langkah rancangan [S, L]** (Spek hlm. 18; Lap. hlm. 81-84):
  1. Hitung distribusi. Mayoritas absolut menentukan hasil.
  2. Bila dua kategori bersebelahan seri, pilih yang lebih kritis.
  3. Polarisasi Accept dan Reject masuk gray zone. Tambah penelaah melalui alur penuh, lalu agregasi ulang.
  4. Catat distribusi, jumlah penelaah, jumlah batch, dan keputusan.
- **Keluaran:**
  - Accept: lanjut P08.
  - Minor: P03-P04, lalu penelaah yang sama.
  - Major: P03-P04-P05.
  - Reject: sesi ditutup, laporan anonim dipublikasikan, identitas penulis diungkap dengan selective disclosure.
- **Data masuk:** rekam reveal.
- **Data keluar:** jumlah suara, `grayZone`, `outcome`.
- **Tetap rahasia:** identitas penulis dan penelaah; editor tidak terlibat.
- **Jenis akun:** tanpa aktor manusia.
- **ZK rancangan:** tidak ada. Agregasi bersifat deterministik.
- **Kontrak dan endpoint:**
  - `$K/ReviewDecisions.sol:50-135,198-215`
  - `$K/PublicationSessions.sol:119`
  - `$S/flows/flows.controller.ts:226`
- **Status: parsial [K].**
  - Mayoritas dan gray zone ada. Status otomatis.
  - Tie-breaker tidak ada. Semua kasus tanpa mayoritas menjadi gray zone, termasuk seri kategori bersebelahan.
  - Tidak ada ambang gray zone yang dapat dikonfigurasi.
  - Jumlah batch tidak dicatat sebagai agregat khusus.
  - `recordRevision` tidak punya endpoint.
  - Revisi tidak melewati P03-P04 on-chain.
  - Penelaah yang sama tidak bisa commit lagi dengan pseudonim yang sama (`$K/ReviewSubmissions.sol:99`).
  - Tes `MinorRevision -> resubmit -> Accept` sebenarnya hanya 2 Accept dan 1 Minor, tanpa revisi (`$CIKO/contracts/test/FullFlow.test.ts:441-559`).
- **Ambigu [L]:** Reject sekaligus mengarsipkan privat dan mengungkap identitas penulis (Lap. hlm. 83). Untuk desk reject, pengungkapan mengikuti kebijakan jurnal (Lap. hlm. 78).

### Tahap 9. Pasca publikasi (P08)

- **Aktor:** sistem, penulis, editor (opsional).
- **Prasyarat:** status `Accepted`.
- **Langkah rancangan [S, L]** (Spek hlm. 21; Lap. hlm. 84-85):
  1. Buka manuskrip dan metadata asli, menggantikan versi anonim.
  2. Catat referensi asli di ledger dan status `Published`.
  3. Penulis membuktikan dengan ZKP bahwa akun permanennya memiliki pseudonim sesi, lalu memperbarui profil.
  4. Pengungkapan editor opsional dengan mekanisme identik.
  5. Perbarui kontribusi anggota secara agregat tanpa menyebut publikasi.
- **Data masuk:** artefak asli, bukti disclosure.
- **Data keluar:** URI final, status, profil.
- **Tetap rahasia:** identitas penelaah, kecuali pengungkapan sukarela terpisah; publikasi mana yang diikuti kontributor.
- **Jenis akun:** persisten dan ephemeral untuk disclosure.
- **ZK rancangan:** selective disclosure kepemilikan pseudonim.
- **Kontrak dan endpoint:**
  - `$S/flows/flows.service.ts:425-449`
  - `$S/flows/flows.controller.ts:258`
  - `$K/PublicationSessions.sol:262`
  - `$S/public/public.controller.ts:12-37`
- **Status: hanya perubahan status dan proyeksi [K].**
  - `finalManuscriptURI` dan `finalMetadataURI` hanya dikembalikan di respons, tidak disimpan (`$S/flows/flows.service.ts:445-446`).
  - Tidak ada selective disclosure, pembukaan artefak, profil, atau kontribusi agregat.
  - `/public/...` tidak memeriksa status `Published`.
  - Audit trail hanya snapshot terbaru, bukan kronologi event.

## 7. Mekanisme anonimitas dan ZK

**Yang ada di kode terkait ZK: tidak ada [K].**

- Tidak ditemukan sirkuit, `.circom`, `.zkey`, verifier, library proof, nullifier, atau verifikasi tanda tangan.
- `ZKP` hanya muncul pada simulasi konseptual di evaluasi (`$S/evaluation/evaluation-payload.factory.ts:46-70`, `$S/evaluation/anonymity-technique-ablation.evaluation.spec.ts:39,319-362,439-444`).
- `README` dan `TA` mengakui keterbatasan ini (`$CIKO/README.md:335-341`; Lap. hlm. v, 96).

**Pembuatan ephemeral account:**

| Aspek | Rancangan [L, S] | Kode [K] |
|---|---|---|
| Identitas | Alamat DLT sementara per sesi per peran (Lap. hlm. 73) | Alamat diberikan klien |
| Keterhubungan | Tidak dapat dikaitkan ke akun permanen maupun sesi lain (Spek hlm. 15) | Memakai commitment akun permanen |
| Pembangkit | Commitment harus berbeda dari sesi sebelumnya (Spek hlm. 10) | Wajib commitment terdaftar dan belum pernah dipakai (`$K/EphemeralAccounts.sol:53-55`) |
| Peran | Dilekatkan kriptografis (Lap. hlm. 76) | Field enum dari pemanggil |
| Kunci | Menyiratkan kepemilikan pseudonim | Tidak ada kunci yang dipakai; pseudonim tidak menandatangani |

**Temuan utama: ledger menautkan pseudonim ke akun permanen [K untuk fakta, I untuk konsekuensi].**

- `PermanentAccountRegistered` memuat alamat dan commitment (`$I/IPermanentAccounts.sol:11-15`).
- `EphemeralAccountCreated` memuat pseudonim, sesi, peran, dan commitment (`$I/IEphemeralAccounts.sol:20-26`).
- Nilainya sama (`$CIKO/contracts/test/FullFlow.test.ts:131,243-246`). `getAccount` juga publik di kedua kontrak.
- Pengamat ledger dapat menggabungkan dua event itu untuk memperoleh alamat permanen penulis, editor, dan penelaah. Jalur B01-B06 terbuka pada level ledger.
- Evaluasi tetap menghasilkan forbidden field 0, karena yang dihitung adalah objek proyeksi `QueryService` (`$S/evaluation/quantitative-metrics.util.ts:88-100`), bukan event on-chain. Ini berbeda dari klaim Lap. hlm. 119.

**Temuan kedua: satu commitment sekali pakai global.** Tes `rejects commitment already used globally` menolak penggunaan pada sesi lain (`$CIKO/contracts/test/EphemeralAccounts.test.ts:106-118`). Satu akun permanen hanya bisa memiliki satu pseudonim seumur sistem.

**Yang dibuktikan tiap proof [L, S]:**

| Bukti | Tahap | Klaim rancangan | Sumber | Di kode |
|---|---|---|---|---|
| Autentikasi anonymous credential | P02, P05, P07, P08 (Spek); setiap tahap (Lap.) | Anggota sah dan berwenang, tanpa membuka identitas | Spek hlm. 5, 10; Lap. hlm. 65, 72-73 | Tidak |
| Pembangkitan pseudonim | P02, P05, P06 | Pseudonim sah, per sesi per peran, tidak terhubung | Lap. hlm. 73, 76, 79 | Tidak |
| Bukti penugasan editor | P05 | Penugasan sah tanpa membuka editor | Lap. hlm. 77 | Hanya `proofRef` bytes32 |
| Asal laporan editor | P05 | Laporan dari pemilik pseudonim editor sesi ini | Lap. hlm. 77 | Tidak |
| Bukti penugasan penelaah | P06 | Komitmen penugasan sah | Lap. hlm. 79 | Hanya `proofRef` bytes32 |
| Asal laporan dan commit | P07 | Dari pemilik pseudonim penelaah sah | Lap. hlm. 81 | Tidak |
| Selective disclosure penulis | P08, Reject | Akun permanen adalah pemilik pseudonim, informasi lain tidak dibuka | Lap. hlm. 83-84; Spek hlm. 21 | Tidak |
| Selective disclosure editor | P08 opsional | Mekanisme identik | Lap. hlm. 85 | Tidak |
| Pencabutan anonimitas | Audit | Hanya bila syarat kebijakan terpenuhi | Lap. hlm. 56-57 | Tidak |

**Perbedaan lokasi verifikasi [L, S].** Lap. hlm. 66 menyebut bukti dieksekusi smart contract. Lap. hlm. 64 dan Spek hlm. 11 menempatkan verifikasi atau pengelolaan ZKP di Compute Server. Skema kredensial dan rumus commitment tidak dirinci.

**Selective disclosure dan kaitan kembali identitas:**

- **Rancangan:** penulis membuktikan hubungan akun permanen dan pseudonim, profil diperbarui, dan penelaah tetap anonim (Spek hlm. 21).
- **Kontribusi:** jumlah agregat, misalnya +1 kontribusi penelaah, tanpa menyebut publikasi (Lap. hlm. 85).
- **Kode:** tidak ada mekanisme kaitan kembali selain commitment yang sudah terbuka. Server tidak menyimpan pemetaan pseudonim.
- **Reputasi jangka panjang:** tidak dirancang Ciko. Sistem insentif di luar cakupan (Spek hlm. 22). Lihat bagian 10.

**Antarmuka minimum simulator ZK [I].** Disusun dari klaim rancangan di atas, plus operasi integrasi yang ditandai "ekstensi".

| Operasi | Tahap | Input privat | Input publik | Output | Klaim yang diverifikasi |
|---|---|---|---|---|---|
| `issueCredential` | P01 | Identitas asli, `identitySecret` | Peran, bidang keahlian | `credential`, `identityCommitment`, `registryRoot` | Satu orang satu commitment; atribut disahkan penerbit |
| `proveMembership` | P02, P05, P07, P08 | `identitySecret`, `credential` | `registryRoot`, `role`, `sessionId`, `scope` | `proof`, `nullifier` | Anggota terdaftar dengan peran tersebut; nullifier unik per sesi, peran, dan scope |
| `createEphemeral` | P02, P05, P06 | `identitySecret`, `salt` | `sessionId`, `role` | `pseudonym`, `sessionCommitment`, `proof` | Pemilik adalah anggota; `sessionCommitment` tidak sama dan tidak dapat ditautkan ke commitment permanen; satu per sesi per peran |
| `proveEphemeralAction` | P05, P07 | Kunci pseudonim atau `identitySecret` | `sessionId`, `pseudonym`, `artifactHash`, `action` | `proof` | Artefak atau aksi berasal dari pemilik pseudonim sah pada sesi dan peran itu; artefak tidak diubah |
| `proveAssignment` | P05, P06 | `identitySecret`, atribut keahlian, `salt` | `sessionId`, `criteriaHash`, `assignmentCommitment`, `selectionSeed` | `proofRef` | Pemegang memenuhi kriteria, terpilih sesuai seed, dan commitment terikat ke pseudonim; editor tidak memilih individu |
| `verifyProof` | Semua | Tidak ada | `kind`, `publicSignals`, `proof` | `valid`, `reason` | Bukti valid, belum dipakai ulang, konteks sesuai |
| `selectiveDisclosure` | P08, Reject | `identitySecret`, `salt` | `sessionId`, `pseudonym`, `sessionCommitment`, akun permanen, atribut yang dipilih | `disclosureProof`, `disclosedAttributes` | Akun permanen memiliki pseudonim; hanya atribut terpilih yang dibuka; tidak membuka sesi lain |
| `proveContribution` | P08 | `identitySecret`, tanda terima sesi | `role`, `epoch`, jumlah | `proof`, `nullifier` | Jumlah keterlibatan benar; tidak terhitung ganda; publikasi tidak disebut |
| `proveReputationBucket` (ekstensi) | P07 untuk q4 | `identitySecret`, tanda terima reputasi | `newSessionId`, `bucket`, `now` | `proof`, `nullifier` | Saldo setelah peluruhan ada di bucket; hanya sekali per sesi |
| `provePaymentNote`, `proveWithdrawal` (ekstensi) | Sebelum P02; setelah distribusi | Rahasia note | `sessionId` atau penerima, `nullifier` | `proof` | Dana tersimpan, belum dipakai, penerima sah, tanpa menaut penyetor |

**Syarat agar simulator berguna [I]:**

- Tandai jelas `scheme: "simulated"`. Jangan klaim sifat kriptografis.
- Simulator harus benar-benar memeriksa witness dan menolak kasus negatif: bukan anggota, peran salah, sesi salah, nullifier dipakai ulang, artefak diubah.
- Pisahkan `Prover` dan `Verifier` dengan bentuk `{kind, publicSignals, proof}`, sehingga verifikasi bisa dipindahkan ke verifier nyata tanpa mengubah alur.
- Rahasia tidak boleh masuk log, on-chain, atau respons API.

**Non-ZK pendamping:** `deriveStealthInvite(publicKey, sessionId)` menghasilkan alamat satu kali, kunci sementara, dan `inviteRef`. `scanInvites(viewKey)` menemukan undangan. Ini menggantikan `_generateStealthInviteRef`.

**Perubahan kontrak yang dituntut simulator [I]:**

- `createEphemeral` tidak boleh menerima commitment permanen. Ganti pemeriksaan `$K/EphemeralAccounts.sol:53-55` dengan `sessionCommitment` dan bukti.
- Hapus commitment permanen dari event.
- Tambahkan pencatatan bukti disclosure pada P08.

## 8. Terimplementasi di kode vs hanya di laporan

| Fitur | Di laporan? | Di kode? | Bukti | Catatan |
|---|---|---|---|---|
| 9 smart contract | Ya, hlm. 96-101 | Ya | `$K/*.sol` | Sesuai |
| Pola admin-session manager | Ya, hlm. 96-97 | Ya | `$K/PublicationSessions.sol:14-22,34-36` | Wiring manual |
| Deploy Ignition satu perintah | Ya, hlm. 104 | Sebagian | `$CIKO/contracts/ignition/modules/FullSystem.ts:7-30` | Tanpa otorisasi |
| Kompiler 0.8.35 | Ya, hlm. 94 | Tidak, 0.8.28 | `$CIKO/contracts/hardhat.config.ts:9`; nama build-info `solc-0_8_28` | Berbeda |
| UI web/mobile | Rancangan hlm. 64; dikecualikan hlm. 88 | Tidak | Tidak ditemukan | Swagger |
| Public DataStore | Ya, hlm. 64 | Tidak | `$S/manuscripts/utils/manuscript.util.ts:7` | File lokal |
| Private DataStore terenkripsi | Ya, hlm. 64, 74 | Tidak | `$S/manuscripts/manuscripts.service.ts:31` | Plaintext |
| Unduh artefak anonim | F15, hlm. 80 | Tidak | `$S/manuscripts/manuscripts.controller.ts:13-126` | Tidak ada endpoint |
| Autentikasi peserta | Ya, hlm. 72-73 | Tidak | `UseGuards`, `AuthGuard`: tidak ditemukan | Semua endpoint terbuka |
| Registrasi akun permanen | Ya, hlm. 97 | Kontrak dan skrip | `$K/PermanentAccounts.sol:21-44`; `$CIKO/contracts/scripts/batch-register.ts:128` | Tanpa endpoint |
| Profil off-chain publik | Ya, hlm. 72 | Tidak | Tidak ditemukan | |
| **ZK: anonymous credentials** | Konseptual, hlm. v, 65, 96 | **Tidak** | Tidak ditemukan | |
| **ZK: verifikasi proof** | Ya, hlm. 66 | **Tidak** | Tidak ditemukan | Tidak ada verifier |
| **ZK: sirkuit** | Tidak dirinci | **Tidak** | Tidak ditemukan | |
| **ZK: simulasi ablasi** | Ya, hlm. 110-112 | Hanya mock evaluasi | `$S/evaluation/evaluation-payload.factory.ts:46-70` | Payload statis |
| **Selective disclosure** | Ya, hlm. 84-85 | **Tidak** | `$S/flows/flows.service.ts:425-449` | Hanya status |
| Pencabutan anonimitas | Analisis, hlm. 56-57 | Tidak | Tidak ditemukan | |
| Pembangkitan pseudonim oleh sistem | Ya, hlm. 73, 103 | Tidak | `$S/flows/flows.service.ts:29-35` | Pseudonim dari klien |
| Keunikan commitment | Ya, hlm. 98 | Ya | `$K/EphemeralAccounts.sol:52-61` | Efeknya sekali pakai global |
| Unlinkability ledger | Klaim, hlm. 116, 119 | Tidak terpenuhi | `$I/IPermanentAccounts.sol:11-15`; `$I/IEphemeralAccounts.sol:20-26` | Lihat bagian 7 |
| Stealth address | Rancangan hlm. 66; batas hlm. 96 | Simulasi hash | `$S/flows/flows.service.ts:245-249,458-465` | Komentar kode mengakui |
| Commit-reveal | Ya, hlm. 100 | Ya | `$K/ReviewSubmissions.sol:73-164` | Server melihat plaintext saat commit |
| Menunggu semua commit | Ya, hlm. 80 | Tidak | `$K/ReviewSubmissions.sol:52-71` | |
| Mayoritas absolut | Ya, hlm. 82 | Ya | `$K/ReviewDecisions.sol:207-212` | |
| Tie-breaker konservatif | Ya, hlm. 82 | Tidak | `$K/ReviewDecisions.sol:214` | Menjadi gray zone |
| Gray zone polarisasi dan ambang | Ya, hlm. 82 | Berbeda | `$K/ReviewDecisions.sol:214` | Semua non-mayoritas; tidak dikonfigurasi |
| Agregasi mengikat semua penelaah | Tersirat, hlm. 81 | Tidak | `$K/ReviewDecisions.sol:53,66` | Daftar dari pemanggil |
| Pengecekan otomatis | Ya, hlm. 74 | Parsial | `$S/manuscripts/manuscripts-automatic-check.service.ts:24-113` | Hasil on-chain dari klien |
| Anonimisasi konten | Ya, hlm. 75; batas hlm. 95 | Metadata saja | `$S/manuscripts/manuscripts-anonymization.service.ts:28-42` | Teks asli tetap |
| Hash anonim dicatat saat P04 | Ya, hlm. 76 | Tidak | `$K/PublicationSessions.sol:38-50`; `$S/flows/flows.service.ts:105-116` | Diwajibkan saat P02 |
| Pemilihan editor acak | Ya, hlm. 76, 103 | Tidak | `$S/flows/flows.service.ts:152-156` | |
| Pemilihan penelaah acak | Ya, hlm. 78-79, 103 | Tidak | `$S/flows/flows.service.ts:204-210`; `$CIKO/contracts/README.md:324` | Lap. hlm. 121 keliru menyebut aturan seleksi di kontrak |
| Transisi ke `UnderReview` lewat server | Tersirat | Tidak | Hanya `$S/flows/flows.service.ts:113,434` memanggil `updateStatus` | **Blocker** |
| Revisi lewat server | Ya, hlm. 83 | Tidak | `recordRevision` tidak ada di `$S` | **Blocker** |
| Masuk ulang P03-P04 | Ya, hlm. 83 | Tidak | `$K/PublicationSessions.sol:160-163`; `$K/AutomaticChecks.sol:55-59` | Tidak mungkin di mesin status |
| Penelaah sama pada revisi minor | Ya, hlm. 83 | Tidak | `$K/ReviewSubmissions.sol:99`; `$K/EphemeralAccounts.sol:53-55` | Perlu perubahan kontrak |
| Kriteria penelaah dicatat | Ya, hlm. 77 | Kontrak saja | `$K/PublicationSessions.sol:170` | Hanya hash di event |
| Referensi manuskrip asli di ledger | Ya, hlm. 84 | Tidak | `$S/flows/flows.service.ts:445-446` | Hanya respons HTTP |
| Halaman publik | Ya, hlm. 75, F20 | Parsial | `$S/public/public.controller.ts:12-37` | Bukan kronologi; tanpa gating |
| Kontribusi agregat | Ya, hlm. 85 | Tidak | Tidak ditemukan | |
| Pengarsipan F11 | "Terpenuhi penuh", hlm. 117 | Tidak khusus | `$K/EditorialScreenings.sol:107-111` | Hanya status |
| Pengungkapan F19 | "Terpenuhi penuh", hlm. 118 | Tidak | `$S/flows/flows.service.ts:425-449` | Laporan melebih-lebihkan |
| E2E terhubung Hardhat lokal | Ya, hlm. 109 | Tidak | `$CIKO/server/test/multi-role-integration.e2e-spec.ts:116-119`; `$CIKO/server/test/app.e2e-spec.ts:28-29` | Mock; nama kontrak mock juga usang (`SessionStorage`, `ReviewPhases`) |
| Ablasi "implemented" | Ya, hlm. 151 | Payload mock | `$S/evaluation/evaluation-payload.factory.ts:2`; `$S/evaluation/anonymity-technique-ablation.evaluation.spec.ts:34,52` | N=5 dan N=1 ditetapkan di tes |
| 396 tes lulus | Ya, hlm. 105 | Log ada | `$CIKO/test/contracts-test.txt`; `$CIKO/test/server-test.txt` | Tidak dijalankan ulang; 4 tes "Limitation" berisi `expect(true)` (`$S/evaluation/nf.evaluation.spec.ts:439-463`) |
| 20 skenario ablasi | Ya, hlm. 110 | 23 skenario | `$CIKO/test/evaluation/technique_ablation_metrics.csv` | 92 baris; P4 dan P5 terbelah dua |
| `EvaluationModule` | Ya, hlm. 102 | Tidak | `$S/app.module.ts` | Hanya berkas spec |

**Perbedaan lain [K, L]:**

- **Endpoint.** Tabel V.6 (`/flows/submit`, `/flows/screen`, `/flows/decide`, `/flows/publish`, dan lainnya, hlm. 103-104) tidak cocok dengan kode. Tabel VI.2 (hlm. 117-118) lebih mendekati.
- **README.**
  - Env `PRIVATE_KEY` dan `app.contracts.permanentAccounts` (`$CIKO/README.md:149-151`) berbeda dari `.env.example`.
  - Banyak contoh curl tidak cocok dengan DTO (`$CIKO/README.md:193-275`).
  - Output sampel `demo_manuscript.pdf` berbeda dari skrip (`$CIKO/server/scripts/generate-sample-pdf.ts:11`).
- **Bug peran.** `$S/flows/flows.dto.ts:22` menulis `1 = Editor, 2 = Reviewer`, sedangkan kontrak `Reviewer=1, Editor=2` (`$I/IEphemeralAccounts.sol:5-9`).
- **Label bias.** Komentar kode tidak cocok spesifikasi. Contohnya `$S/flows/flows.service.ts:46,169,203,322` memakai B01, B04, B05, B06 dengan arti lain.
- **Tabel V.2.** Kolom data memakai D01-D09 (hlm. 90), bertabrakan dengan kelas D01-D04.
- **Delta paparan.** Proksi reveal menunjukkan delta 5 (hlm. 124), ablasi kontrol menunjukkan delta 1 (hlm. 127). Payload berbeda.

## 9. Cara menjalankan

**PERINGATAN: langkah berikut hasil baca kode, BUKAN hasil dijalankan.** `node_modules` dan `artifacts` tidak ada di repo.

**Prasyarat:** Node.js `>=20`, npm atau bun. Tidak perlu DB. Tidak perlu Docker.

```bash
# 1. Kontrak
cd /home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/contracts
npm install
npm run compile

# 2. Node lokal (terminal terpisah), RPC default http://127.0.0.1:8545
npm run node

# 3. Deploy lokal
npm run deploy:local

# 4. Seed akun permanen (network localhost tidak dicontohkan README, belum diverifikasi)
PERMANENT_ACCOUNTS_ADDRESS=0x... npx hardhat run scripts/batch-register.ts --network localhost

# 5. Berikan izin session manager: TIDAK ADA SKRIP. Perlu ditulis.
#    Urutan contoh: contracts/test/FullFlow.test.ts:147-180

# 6. Server
cd ../server
npm install
cp .env.example .env    # isi alamat kontrak dari ignition/deployments/chain-*
npm run start:dev       # harus dari folder server/
```

**[I] Yang perlu diverifikasi:**

- `deploy:local` memakai `--network localhost`, sedangkan `localhost` tidak dideklarasikan di `$CIKO/contracts/hardhat.config.ts:26-41`. Bisa jadi tersedia bawaan Hardhat 3.
- Akses `configVariable` Sepolia mungkin tidak memerlukan keystore untuk jaringan lokal.

**Env server** (`$CIKO/server/.env.example:1-14`, `$S/config/app.config.ts:3-17`):

| Variabel | Keterangan |
|---|---|
| `RPC_URL` | Default `http://127.0.0.1:8545` |
| `CHAIN_ID` | Default `31337`; Sepolia `11155111` |
| `SERVER_PRIVATE_KEY` | Wajib; harus session manager |
| `PERMANENT_ACCOUNTS_ADDRESS` | Wajib |
| `EPHEMERAL_ACCOUNTS_ADDRESS` | Wajib |
| `PUBLICATION_SESSIONS_ADDRESS` | Wajib |
| `AUTOMATIC_CHECKS_ADDRESS` | Wajib |
| `EDITORIAL_SCREENINGS_ADDRESS` | Wajib |
| `ASSIGNMENT_PROOFS_ADDRESS` | Wajib |
| `REVIEWER_SELECTIONS_ADDRESS` | Wajib |
| `REVIEW_SUBMISSIONS_ADDRESS` | Wajib |
| `REVIEW_DECISIONS_ADDRESS` | Wajib |

**Port dan lokasi [K]:**

- Server `3000`, hard-coded (`$S/main.ts:24`).
- Swagger `http://localhost:3000/api` (`$S/main.ts:22`). Health `GET /health`.
- ABI dibaca dari `../contracts/artifacts/...` relatif terhadap `cwd` (`$S/contracts/contracts.service.ts:56-59`).
- Berkas disimpan di `server/storage/manuscripts/` (`$S/manuscripts/utils/manuscript.util.ts:7`).

**Sepolia [K]:**

```bash
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
npx hardhat ignition deploy ignition/modules/FullSystem.ts \
  --network sepolia \
  --parameters ignition/parameters.json \
  --deployment-id <id-baru>
```

**[I]** Alamat di `$CIKO/contracts/ignition/deployments/sepolia-full-system-v1/deployed_addresses.json` tidak bisa dipakai untuk tulis tanpa kunci admin aslinya. Rencanakan deploy baru.

**Tes [K]:**

```bash
# contracts/
npm run test:local
npm run test:all      # butuh keystore dan RPC Sepolia

# server/
npm run test:unit
npm run test:e2e      # manuscripts.e2e tidak di-mock: butuh artifact dan .env
npm run test:evaluation
npm run test:all:report
```

**Urutan alur melawan chain nyata [I]:**

1. `POST /flows/ephemeral-account`, lalu `POST /manuscripts/intake`.
2. `POST /manuscripts/:id/anonymize` terlebih dahulu bila ingin hash anonim benar.
3. `POST /flows/submission`.
4. `POST /manuscripts/automatic-check`, lalu `POST /flows/automatic-checks`.
5. `POST /flows/anonymization`.
6. `POST /flows/ephemeral-account` untuk editor, lalu `POST /flows/assign-editor`, `POST /flows/assignment-proofs/editor`, `POST /flows/editorial-screening`.
7. `POST /flows/reviewer-selection`, `POST /flows/assignment-proofs/reviewers`.
8. **Berhenti di sini: tidak ada endpoint status 9.** Panggil `PublicationSessions.updateStatus(sessionId, 9)` di luar server.
9. Lanjut `POST /flows/reviews/phase`, commit, phase, reveal, `POST /flows/review-decisions/decide`, `POST /flows/publication/finalize`.

## 10. Tumpang tindih dan bentrok dengan Hugo dan Roihan

**Perbandingan:**

| Aspek | Ciko | Hugo | Roihan |
|---|---|---|---|
| Unit data | `PublicationSession`, `bytes32 sessionId`, hash + URI (`$I/IPublicationSessions.sol:21-35`) | `Batch`, `uint256`, tanpa manuskrip on-chain (`$HUGO/contracts/IncentiveEngine.sol:38-44`) | `Manuscript`, `uint256 msId`, `cid`, `metadata` on-chain (`$ROIHAN/smartcontract/contracts/PublicationRegistry.sol:97-112`) |
| Identitas penulis | Pseudonim | `msg.sender` asli (`IncentiveEngine.sol:78,83`) | Burner, dibuat browser (`$ROIHAN/frontend/src/core/services/wallet.ts:223-228`) |
| Identitas penelaah | Commitment + pseudonim | Alamat, ditetapkan penulis (`IncentiveEngine.sol:72-81`) | Session wallet; backend menyimpan `main_address` dan `session_privkey` (`$ROIHAN/backend-go/internal/db/migrations/005_session_wallets.up.sql:16-25`) |
| Pemilihan penelaah | Tidak diimplementasikan | Dari penulis, default `DEMO_REVIEWERS` (`$HUGO/server/index.ts:60-64`) | Oracle + backend berdasarkan bidang (`$ROIHAN/oracle/src/index.js:33,51-58`) |
| Pembayaran | Tidak ada | ETH `msg.value` di muka | JRT setelah `ACCEPTED`, `PUBLICATION_FEE` 100 (`PublicationRegistry.sol:132,385-429`) |
| Insentif | Tidak ada | TOPSIS + sigmoid, ETH + SBT (`IncentiveEngine.sol:103-175`) | Tetap 10 JRT (`PublicationRegistry.sol:133,403-408`) |
| Token | Tidak ada | `ReputationSBT` kustom | `JournalToken` ERC-20, `DOIToken` ERC-721 |
| Keputusan | Mayoritas + gray zone | Tidak ada | Mayoritas; tanpa mayoritas menjadi revisi (`PublicationRegistry.sol:480-498`) |
| Solidity | `^0.8.28` / 0.8.28 | `^0.8.24` / 0.8.24 (`$HUGO/hardhat.config.ts:12`) | `^0.8.24` / 0.8.24, `viaIR`, cancun (`$ROIHAN/smartcontract/hardhat.config.js`) |
| Hardhat | 3.x, viem, Ignition, node:test, ESM | 2.x, toolbox ethers, Mocha | 2.x, toolbox, upgrades, UUPS |
| Peran on-chain | Admin, session manager | `Ownable` | `AccessControl`: ADMIN, RESEARCHER, REVIEWER, ORACLE, OPERATOR |
| Relayer | Akun server, tanpa tanda tangan peserta | Tidak (MetaMask untuk deposit) | Operator + EIP-712 (`PublicationRegistry.sol:208-236,310-350`) |
| Backend | NestJS 11, port 3000, tanpa DB | Express 5, `PORT` atau 3000 (`$HUGO/server/index.ts:1118`), JSON (`:661`) | Go, Gin, Postgres, port 3001 |
| Frontend | Tidak ada | HTML + esbuild | Next.js 16.2.7, React 19.2.4, wagmi, viem |
| Penyimpanan | Lokal | JSON lokal | Pinata/IPFS (Lap. Roihan hlm. 77) |

**Bentrok dan resolusi sesuai prioritas [I]:**

| Bentrok | Bukti | Resolusi usulan |
|---|---|---|
| Penulis menetapkan penelaah saat deposit | `IncentiveEngine.sol:72-81` | Pisahkan deposit dari penugasan. Daftar penelaah masuk setelah P06, dari sistem |
| Editor memicu distribusi dan melihat penelaah | `$HUGO/server/index.ts:817-818` | Distribusi dipicu sistem setelah keputusan; editor hanya menetapkan kebijakan bobot |
| Satu batch, satu distribusi | `IncentiveEngine.sol:110,141` | Tentukan aturan untuk gray zone dan revisi |
| Status publikasi dua sumber | `$I/IPublicationSessions.sol:5-19`, `PublicationRegistry.sol:78-89` | Pakai `PublicationSessions`. Registry Roihan tidak dipakai sebagai state machine |
| Biaya setelah diterima vs di muka | `PublicationRegistry.sol:385-429`, `IncentiveEngine.sol:72` | Ikuti escrow Hugo sesuai instruksi pengguna |
| `metadata` dan `cid` asli di ledger | `PublicationRegistry.sol:101,229-230` | Tolak; melanggar invariant D01 (Spek hlm. 9) |
| Bidang penelaah di ledger | `PublicationRegistry.sol:286-293` | Simpan off-chain; akun permanen tidak boleh memuat profil (Spek hlm. 14) |
| Editor tahu penelaah saat keputusan | `PublicationRegistry.sol:262-282` | Editor hanya memberi kriteria; pemilihan oleh sistem |
| Port 3000 | `$S/main.ts:24`, `$HUGO/server/index.ts:1118` | Konfigurasikan port. Next.js dev kemungkinan juga 3000 |
| Hardhat 2 vs 3 | `package.json` ketiganya | Satu workspace Hardhat 3, port kontrak dan tes bertahap. Plugin upgrades Roihan belum diverifikasi kompatibel |
| Plagiarisme oracle vs P03 tanpa AI | `PublicationRegistry.sol:131,235`; Spek hlm. 15 | Hanya pakai bila deterministik. `oracle/src/plagiarism.js` tidak diperiksa rinci di sini |

### Titik pembayaran yang dapat membocorkan identitas [I, berdasarkan kode]

| Titik | Bukti | Yang bocor | Mitigasi simulasi |
|---|---|---|---|
| Deposit APC dari wallet asli | `IncentiveEngine.sol:78,83` | Alamat penulis ke batch dan sesi (B03, B05) | Deposit ke pool nominal tetap, tanpa `sessionId`; ikat sesi kemudian dengan note dan nullifier |
| Mendanai burner dari wallet utama | `$ROIHAN/frontend/src/core/services/wallet.ts:279-300` | Tautan langsung wallet utama ke burner | Jangan danai burner; server yang relay |
| Judul jurnal di calldata | `IncentiveEngine.sol:72,81`; `$HUGO/server/index.ts:690-694` | Konten dapat dibaca dari calldata | Ganti dengan `sessionId` atau hash |
| Refund ke penyetor | `IncentiveEngine.sol:169-172` | Alamat asli pada kasus tidak ada penelaah | Refund ke alamat baru lewat bukti note |
| Refund desk reject | Tidak ada pada Hugo; `createBatch` butuh penelaah | Jalur tidak tersedia; memakai alamat asli berisiko | Tambahkan refund yang tidak menyebut alamat |
| Reward ke alamat penelaah | `IncentiveEngine.sol:154-164`, event `:51` | Pasangan alamat, nilai, batch (B01, B06) | Akumulasikan ke pseudonim di pool; tarik terpisah |
| Penarikan reward | `$ROIHAN/frontend/src/core/services/wallet.ts:336-338` | Roihan sendiri mengakui tautan dari wallet utama | Server sebagai relayer, penerima alamat baru, jeda waktu, jumlah dibulatkan |
| Nominal unik | `IncentiveEngine.sol:147` | Nilai sigmoid menjadi sidik jari | Bucket nominal, batch periodik |
| Matriks q di calldata | `IncentiveEngine.sol:103-108` | Skor per penelaah, q4 menjadi quasi-identifier lintas sesi (B08) | Bucket q4; pertimbangkan hanya komitmen matriks |
| SBT ke alamat | `$HUGO/contracts/ReputationSBT.sol:18,26,62-72` | Riwayat aktivitas alamat; melanggar Spek hlm. 14 bila alamat permanen | Lihat opsi reputasi |
| QoS sebelum reveal | `$HUGO/server/index.ts:792-813` | Teks telaah dan alamat diproses lebih awal (B07) | Hitung q2, q3 setelah reveal dari `reviewURI` terverifikasi |
| Timing | Transaksi berurutan | Korelasi deposit, sesi, reveal, klaim | Jeda dan batch; akui sebagai risiko sisa (Lap. hlm. 96) |

### Reputasi jangka panjang tanpa mengaitkan identitas [I]

**Kendala:**

- Akun permanen tidak boleh memuat riwayat (Spek hlm. 14).
- Pseudonim mati setiap sesi. SBT pada pseudonim tidak terbawa.
- q4 Hugo membutuhkan angka saat distribusi. Kontrak menerimanya sebagai matriks (`IncentiveEngine.sol:103-108`), bukan membaca SBT, sehingga q4 bisa berasal dari bukti.

| Opsi | Cara | Kelebihan | Kekurangan |
|---|---|---|---|
| A. Literal spesifikasi | Profil off-chain mencatat jumlah agregat (Spek hlm. 21) | Paling sesuai Ciko | q4 tidak terverifikasi; hanya jumlah |
| B. Tanda terima tak-tertaut | Setelah distribusi, catat `receipt = H(secret, sessionId, role, bucket, epoch)` tanpa alamat. Di sesi berikutnya `proveReputationBucket` membuktikan saldo setelah peluruhan, dengan nullifier per sesi | Tidak menaut sesi; non-transferable lewat `secret`; peluruhan tetap | Perlu kontrak tanda terima; tetap simulasi |
| C. `reputationId` stabil | SBT berbasis `H(secret, "rep")`, mint batch per epoch | Perubahan kecil pada Hugo | Aktivitas lintas sesi dapat ditautkan, tetapi tidak ke nama asli; melemahkan B08 |

**Rekomendasi:** opsi B bila ingin setia pada prioritas Ciko, opsi C bila waktu terbatas. Keputusan perlu ditanyakan ke pengguna.

**q1 dan peserta:** timestamp `committedAt` dan `revealedAt` (`$K/ReviewSubmissions.sol:109-110,142`) dapat menjadi dasar q1. `hasReveal` dapat menjadi mask `participated`. TOPSIS perlu minimal 2 penelaah (`$HUGO/server/index.ts:828-829`).

## 11. Yang layak dipakai ulang untuk integrasi

| File | Pemakaian | Penyesuaian |
|---|---|---|
| `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/contracts/contracts/PublicationSessions.sol` | Tulang punggung mesin status | Pisahkan hash asli saat P02 dan artefak anonim saat P04; revisi masuk ulang P03-P04; simpan referensi final P08 |
| `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/contracts/contracts/EphemeralAccounts.sol` | Registri pseudonim | Ganti commitment permanen dengan `sessionCommitment` dan verifikasi bukti; hapus batas sekali pakai global terhadap identitas |
| `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/contracts/contracts/PermanentAccounts.sol` | Registri akun | Pertahankan; kurangi data event bila perlu |
| `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/contracts/contracts/AutomaticChecks.sol` | Anchor P03 | Izinkan pengecekan pada putaran revisi |
| `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/contracts/contracts/EditorialScreenings.sol` | Anchor P05 | Sesuaikan jalur revisi desk sesuai keputusan pengguna |
| `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/contracts/contracts/AssignmentProofs.sol` | Komitmen penugasan | Terima bukti simulator; ikat satu commitment ke satu pseudonim |
| `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/contracts/contracts/ReviewerSelections.sol` | Audit batch | Bisa memicu `UnderReview` atau dibiarkan orkestrator |
| `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/contracts/contracts/ReviewSubmissions.sol` | Commit-reveal | Kunci per putaran agar penelaah sama bisa menilai ulang; `commitHash` dihitung klien; wajibkan semua commit sebelum reveal |
| `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/contracts/contracts/ReviewDecisions.sol` | Agregasi | Tambah tie-breaker dan ambang; ikat ke batch `ReviewerSelections` |
| `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/contracts/ignition/modules/FullSystem.ts` | Deploy | Tambah `m.call` wiring |
| `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/contracts/test/FullFlow.test.ts` | Dasar tes on-chain | Tambah revisi nyata, gray zone dua putaran |
| `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/server/src/flows/flows.service.ts` | Orkestrasi | Tambah `updateStatus(9)`, revisi, kriteria; ganti input klien dengan seleksi dan simulator |
| `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/server/src/flows/flows.dto.ts` | Validasi | Perbaiki label peran; buang field yang diabaikan |
| `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/server/src/contracts/contracts.service.ts` | Abstraksi kontrak | Path ABI dan alamat dari config deployment |
| `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/server/src/query/query.service.ts` | Proyeksi | Tambah kronologi dari event; gating status |
| `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/server/src/manuscripts/manuscripts-automatic-check.service.ts` | Aturan P03 | Tautkan ke sesi; hasil dihitung server; tolak `identityExposed` sesuai aturan |
| `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/server/src/manuscripts/manuscripts-anonymization.service.ts` | P04 | Bangun ulang isi tanpa identitas. Untuk demo, gunakan templat PDF terkontrol agar nama tidak tersisa |
| `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/server/src/manuscripts/utils/sample-generator.util.ts` | Data demo | Pisahkan halaman identitas agar mudah diuji |
| `/home/ihaidar/Projects/DecPub-claude/Ciko/Anonymize-Publication-main/server/src/evaluation/quantitative-metrics.util.ts` | Metrik | Tambah evaluasi terhadap event on-chain, bukan hanya proyeksi |
| `/home/ihaidar/Projects/DecPub-claude/Hugo/ojs-incentive-main/contracts/IncentiveEngine.sol` | TOPSIS, sigmoid, escrow | Pisahkan deposit dan penugasan; ganti alamat dengan identitas sesi; tambah refund |
| `/home/ihaidar/Projects/DecPub-claude/Hugo/ojs-incentive-main/contracts/ReputationSBT.sol` | Reputasi | Sesuaikan opsi B atau C |
| `/home/ihaidar/Projects/DecPub-claude/Hugo/ojs-incentive-main/middleware/qos/types.ts` | Antarmuka QoS | Implementasi simulasi q2, q3 tanpa LLM |
| `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/smartcontract/contracts/DOIToken.sol` | DOI pada P08 | Mint setelah disclosure; petakan `sessionId` ke DOI |
| `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/frontend/src/app` | Halaman peran | Sesuaikan ke alur Ciko; stripdown tampilan |
| `/home/ihaidar/Projects/DecPub-claude/Roihan/Publication_System_DLT-main/frontend/src/core/services/wallet.ts` | Burner dan penandatanganan | Hapus pendanaan dari wallet utama |

**Tambahan yang harus dibuat [I]:**

- Layanan penyimpanan publik simulasi IPFS: unggah, unduh berdasarkan hash, HTML sederhana. Private store terpisah.
- Layanan ZK simulator (bagian 7).
- Skrip wiring. Orkestrator seleksi editor dan penelaah.
- Kontrak atau modul escrow pool. Layanan QoS simulasi.
- Otentikasi peran. Skrip demo satu perintah.

**Risiko:**

1. **Simulasi disalahartikan sebagai kriptografi nyata.** Nyatakan jelas di UI dan dokumen.
2. **Redeploy berantai.** Referensi `immutable` tanpa proxy berarti perubahan kontrak dasar memaksa deploy ulang kontrak di atasnya.
3. **Anonimitas gagal diam-diam.** Tes berbasis mock tidak mendeteksi kebocoran on-chain. Wajibkan tes integrasi yang membaca event.
4. **Tes hijau menipu.** Mock e2e menutupi blocker. Tes `MinorRevision` tidak menguji revisi. Harus ada e2e melawan node lokal.
5. **Kunci tes di repo.** `$CIKO/contracts/ignition/parameters.json:6-17` berisi private key teks jelas. Anggap sudah bocor. Jangan didanai atau dipakai ulang.
6. **Server serba tahu.** Pemetaan identitas dan rekomendasi saat commit ada di server. Sesuai model laporan (hlm. 95), tetapi bertentangan dengan rumusan NF01 Spek hlm. 6. Lebih baik penulis dan penelaah menyimpan secret di klien bila memungkinkan.
7. **Pembayaran.** Escrow bisa menjadi kebocoran terbesar, dan Ciko tidak merancangnya. Ini area penelitian baru dalam integrasi.
8. **Sepolia lambat.** Setiap tulis menunggu receipt, dan satu alur butuh banyak transaksi. Log tes deployed mencatat sekitar 8-11 detik per tes baca (`$CIKO/test/contracts-test.txt`). Demo sebaiknya lokal dulu.
9. **Ukuran pool kecil.** Demo dengan sedikit akun memberi himpunan anonim kecil; Lap. hlm. 123 menganggap N di bawah 3 lemah.
10. **Konten tetap bisa mengungkap penulis.** Gaya, topik, dan sitasi tidak tertangani (Spek hlm. 22).

**Keputusan yang perlu ditanyakan ke pengguna:**

1. Apakah identitas penulis tetap diungkap pada `Reject`? Laporan memuat dua arah kebijakan (hlm. 78, 83).
2. Jalur revisi desk: apakah setelah P03-P04 tetap disaring editor yang sama, atau langsung ke P06? Laporan, spesifikasi, dan kode berbeda.
3. Revisi minor oleh penelaah yang sama: tetap memakai pseudonim sesi yang sama (perlu commit per putaran), atau pseudonim baru yang dibuktikan setara?
4. Opsi reputasi A, B, atau C.
5. Aturan APC: berapa refund pada desk reject dan tidak ada partisipasi, dan bagaimana alokasi antarputaran gray zone dan revisi?
6. Basis backend: mempertahankan NestJS Ciko sebagai orkestrator, atau menggeser logikanya ke Go Roihan?
7. Basis kontrak: satu workspace Hardhat 3 dan apakah UUPS Roihan tetap dipertahankan?
