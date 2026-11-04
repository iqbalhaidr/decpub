# Progres

Diperbarui di akhir setiap sesi.

## Terakhir diperbarui

2026-11-05, sesi M6.

## Selesai

- Analisis ketiga codebase: [`analisis/hugo.md`](analisis/hugo.md), [`analisis/ciko.md`](analisis/ciko.md), [`analisis/roihan.md`](analisis/roihan.md).
- Sepuluh keputusan abu-abu dan enam default turunan ditetapkan: [`arsitektur.md`](arsitektur.md) bagian 2.
- Rancangan sistem: [`arsitektur.md`](arsitektur.md). Rencana milestone M0-M13: [`PLAN.md`](PLAN.md).
- **M0 selesai.** Semua kriteria terpenuhi dan dijalankan sendiri:
  - `integrated/` berdiri: npm workspaces (baru `contracts`), `.env.example`, `README.md`, `.gitignore`.
  - 9 kontrak Ciko dan 10 berkas tesnya disalin tanpa perubahan ke `contracts/contracts/ciko/` dan `contracts/test/ciko/`.
  - `npm run test:contracts`: **169 tes lulus** (baseline pertama kode Ciko yang benar-benar dijalankan; hasilnya cocok dengan klaim tesnya).
  - `npm run chain` menyalakan node Hardhat di :8545. `npm run deploy:local` mencetak 9 alamat dan menulis `contracts/deployments/localhost.json`.
  - `ignition/modules/Integrated.ts` (membungkus `CikoSystem.ts`, salinan `FullSystem.ts`) memasang izin: operator jadi session manager di 8 kontrak, dan `AutomaticChecks`, `EditorialScreenings`, `ReviewDecisions` jadi session manager di `PublicationSessions`. Daftar izinnya satu sumber di `contracts/wiring.ts`.
  - `npm run check-wiring`: **37/37 lulus** (kode ada, admin = deployer, izin positif dan negatif). Diuji negatif: dicabut satu izin, pemeriksa gagal dengan kode 1, lalu dipulihkan.
  - `ignition/parameters.json` Ciko (berisi kunci privat) dan folder `deployments` Ciko tidak disalin.

- **M1 selesai.** Semua kriteria terpenuhi dan dijalankan sendiri:
  - `services/storage-sim` (Express 5 + multer): `POST /api/v0/add` (multipart, balasan NDJSON `{Name, Hash, Size}` dengan `Size` string seperti Kubo, mendukung `only-hash=true`), `GET|HEAD /ipfs/:cid` (`?download=1&filename=`), halaman HTML polos tanpa JS/CSS di `/` (form unggah, form cari ID, tautan buka/unduh), `/healthz`. CIDv1 raw sha-256 lewat `multiformats`. Berkas disimpan di `data/storage/<cid>` (+ `.json` metadata), tulis atomik, idempoten.
  - `packages/shared`: `StorageProvider` (`cidOf`, `put`, `get`, `stat`), `HttpStorageProvider` (subset Kubo, bisa dipakai ke simulator maupun Kubo), `storageConfigFromEnv`, `gatewayUrl`, helper CID. `get` memeriksa ulang hash isi untuk CID raw (gateway tidak dipercaya).
  - Rangkaian tes kontrak provider (`@decpub/shared/testing`) dijalankan otomatis melawan simulator, dan bisa dijalankan melawan Kubo: `npm run test:external -w packages/shared` dengan `STORAGE_API_URL`/`STORAGE_GATEWAY_URL`.
  - Hasil: `npm run test:storage` **23 tes lulus** (4 unit + 19 simulator/provider), `npm run typecheck` bersih, `npm run test:contracts` tetap **169 lulus**.
  - `npm run demo:m1` (regresi, mandiri) lulus 10/10 pemeriksaan.
  - Uji proses nyata (`npm run storage`, perilaku form seperti browser lewat curl): unggah `Ciko/TA_Ciko.pdf` (1,1 MB) lewat form HTML dan lewat API Kubo, CID sama; `sha256sum` berkas unduhan = aslinya (`d40a914f...`); CID tak dikenal 404, CID tak sah 400; tes eksternal 5/5 lulus.
  - Keamanan sederhana pada gateway: isi tidak pernah disajikan sebagai HTML (`octet-stream` atau `pdf`, `nosniff`, CSP sandbox), nama berkas di-escape, CID divalidasi sebelum menyentuh path disk, batas ukuran 50 MiB (413).

- **M2 selesai.** Semua kriteria terpenuhi dan dijalankan sendiri:
  - **Kontrak.** `EphemeralAccounts` diubah (satu-satunya kontrak Ciko yang berubah): tanpa `PermanentAccounts`, tanpa keunikan commitment global, field `identityCommitment` menjadi `sessionCommitment`. Baru: `IZkVerifier` (enum `Kind` 1-8), `SimulatedZkVerifier` (`ecrecover` attestor atas `proofDigest` berisi domain, chain, alamat verifier, jenis, hash sinyal; `setAttestor` untuk rotasi), `ActionGateway` (EIP-712 untuk `createSessionSigned`, `recordRevisionSigned`, `screeningSigned`, `commitReviewSigned`, `revealReviewSigned`; ber-ZK `createEphemeralWithProof` dan `bindAssignment`; 10 fungsi passthrough khusus operator; `setVerifier`/`setOperator`/`transferAdmin`). Gateway kompilasi tanpa `viaIR`: risiko "stack too deep" tidak terjadi karena semua aksi bertanda tangan memakai parameter struct.
  - **Wiring.** `Integrated.ts` sekarang men-deploy verifier dan gateway; gateway menjadi session manager di 8 kontrak Ciko, operator **tidak** di mana pun. `check-wiring`: **60/60 lulus** (ditambah: operator bukan session manager, gateway/verifier/attestor benar). Diuji negatif: izin gateway di `ReviewDecisions` dicabut, pemeriksa gagal kode 1, lalu dipulihkan.
  - **`packages/shared`**: `keys` (kunci dev lokal, wajib env di jaringan non-lokal), `identity` (secret, `identityCommitment`, `reputationId`, kunci pseudonim, nullifier, `sessionCommitment`, `assignmentCommitment`, kredensial peran), `zk` (`ZkKind`, `ZkProver`, `HttpZkProver`, `proofDigest`, `signProof`, pembangun sinyal), `actions` (domain dan tipe EIP-712, `sign*`, `computeCommitHash`), `node` (`readDeployments`), `abis.generated.ts` (11 kontrak, ditulis `npm run compile -w contracts` atau `npm run export-abis`).
  - **`services/zk-sim`** (Express :8082): `POST /prove`, `POST /verify`, `GET /info`, `/healthz`. Pemeriksa witness untuk `EPHEMERAL` (identitas terdaftar di `PermanentAccounts` lewat RPC, kredensial sah untuk peran, pseudonim/commitment/nullifier turunan dari secret) dan `ASSIGNMENT_OWNERSHIP` (salt undangan). Jenis lain membalas 501 dan menyebut milestone pengisinya. Witness tidak disimpan, tidak dicatat, tidak ikut galat (diuji).
  - **Tes:** `npm test` lulus seluruhnya. Kontrak **191** (169 di `test/ciko`, 21 baru di `test/integrated`: 6 verifier dan 15 gateway; selisih 1 kemungkinan `helpers.ts` yang dihitung `node:test` sebagai berkas, belum dipastikan), shared **14** (4 CID, 10 kripto klien), storage-sim **19**, zk-sim **13**. `npm run typecheck` bersih. Tes gateway mencakup alur penuh P03 sampai `Published` **seluruhnya lewat gateway di EVM** (editor, seleksi, pengikatan penugasan, commit, reveal, `decideBatch`, status 9 lewat `updateStatus`).
  - **`npm run demo:m2`** (butuh `chain` dan `deploy:local`; zk-sim dinyalakan sendiri), semua pemeriksaan OK terhadap node sungguhan:
    pseudonim Author dan Reviewer dibuat dengan bukti sah (pengirim tx = operator); satu orang punya pseudonim di dua sesi dengan nilai berbeda; ditolak on-chain: bukti palsu (secret salah), peran salah, sesi salah, nullifier dipakai ulang (`NullifierAlreadyUsed`), tanda tangan palsu (`InvalidSignature`), replay nonce (`InvalidNonce`); server memanggil `PublicationSessions.createSession` langsung gagal `OnlySessionManager`; pemindaian seluruh calldata dan log transaksi sesi: tidak ada commitment permanen, secret, atau alamat dompet.

- **M3 selesai.** Semua kriteria terpenuhi dan dijalankan sendiri (`npm run demo:m3`, proses nyata, tanpa mock):
  - **Server** `integrated/server` (NestJS 11, port 3001, Swagger `/api`). Dijalankan lewat `@swc-node/register/esm-register` karena DI/ValidationPipe butuh `emitDecoratorMetadata` (`tsx`/esbuild tidak menyediakannya) dan `@decpub/shared` adalah TS ESM. Modul: `config`, `db` (`node:sqlite`, migrasi berversi, di balik repositori), `auth`/`users`/`journals`/`verification`/`seed` (port dari Go Roihan), `chain` (`ChainService`, `GatewayService`, `SessionReader`), `storage` (storage publik via `StorageProvider`, `PrivateStore` AES-256-GCM dengan AAD = ref), `pdf` (anonimizer port Ciko, ekstraksi teks, sampel), `plagiarism`, `manuscripts`, `flows`, `public`.
  - **Alur:** P01 daftar, login JWT, `POST /me/identity` (commitment ke `PermanentAccounts` lewat akun registrar), `GET /me/credentials` (kredensial peran + bidang), antrian verifikasi bidang oleh admin. P02 `intake` (asli + identitas terenkripsi, hash/CID anonim dihitung, `metadataHash` bergaram), pseudonim lewat `/flows/ephemeral-account` tanpa JWT, `/flows/submission` meneruskan `createSessionSigned` setelah isi aksi dicocokkan dengan hasil intake. P03 `result` dihitung server, laporan diunggah ke storage publik. P04 unggah naskah anonim, CID dan sha256 diperiksa silang dengan on-chain, `updateStatus(5)`. `advance {recheck}` untuk `Incomplete`.
  - **Hasil `demo:m3` (semua OK):** sesi sampai `UnderEditorialScreening`; PDF anonim terunduh dari storage dengan CID dan sha256 sama dengan on-chain, metadata Author = "Anonymous"; naskah asli tidak ada di storage publik; berkas privat terenkripsi (tanpa `%PDF`/nama di disk); `Incomplete` bisa dicek ulang (batch 2 on-chain); plagiarisme (skor 51 > 30) dan 100 halaman menjadi `Rejected`; peringatan `identityExposed` tampil tanpa mengubah hasil; negatif: 401/403/404 pada manifes dan sesi orang lain, aksi dimanipulasi 400, tanda tangan pseudonim lain `InvalidSignature`, `NullifierAlreadyUsed`, kredensial peran salah ditolak zk-sim, operator memanggil `PublicationSessions` langsung `OnlySessionManager`; pemindaian 21 transaksi: tanpa commitment permanen, secret, alamat dompet, nama, surel.
  - **Tes:** `npm test` lulus seluruhnya: kontrak 191, shared 15, storage-sim 19, zk-sim 13, **server 31** (private store, anonimizer, pengecekan P03 per jenis sampel, komitmen bergaram, HTTP: auth/peran/kebijakan bobot/identitas/kredensial/verifikasi/kepemilikan manifes). `npm run typecheck` bersih. Regresi `demo:m1`, `demo:m2`, `check-wiring` (60/60) tetap lulus.
  - **Perbaikan atas Ciko yang dikerjakan:** `result` P03 dari server (bukan klien); manifes (memuat nama) hanya untuk pemilik; label peran DTO: `0=Author, 1=Reviewer, 2=Editor` (Ciko menulis Editor=1); `metadataHash` bergaram; `ESCROW_REQUIRED=false`.
  - Skrip bersama untuk M4+ dan M12: `scripts/lib/{services,api,member,chain-scan}.ts` (menyalakan layanan sebagai proses nyata, klien HTTP, perilaku klien/browser memakai `packages/shared`, pemindai kebocoran ledger).

- **M4 selesai.** Semua kriteria terpenuhi dan dijalankan sendiri (`npm run demo:m4`, node Hardhat sungguhan, proses nyata, tanpa mock; dijalankan 4 kali berturut-turut karena seleksinya acak, semuanya lulus, 48 pemeriksaan):
  - **Alur.** Setelah P04 sistem mengundang satu editor acak (terdaftar, bidang = kategori jurnal). Editor menerima dengan pseudonim Editor lewat bukti `ASSIGNMENT_OWNERSHIP` (`assignEditor` + `recordEditorAssignmentProof`), memutus lewat `screeningSigned` beserta laporan (publik ke storage, lengkap ke storage privat). `Proceed` mencatat kriteria (`recordReviewerCriteria`) dan sistem memilih 3 penelaah acak per bidang (bukan penulis naskah, belum diundang di sesi itu), `recordSelectionBatch` + `batchRecordReviewerAssignmentProofs`. Penelaah membuat pseudonim Reviewer (slot = nomor batch) dan `bindAssignment`. Setelah semua mengikat: `updateStatus(9)` (endpoint yang tidak ada di Ciko) + fase Commit. Setelah semua commit: Reveal. Setelah semua reveal: Closed, `decideBatch` hanya atas pseudonim yang reveal (D3), `Accepted`, lalu `Published`.
  - **Server** (`server/src`): `selection/` (`SelectionService`, `InvitationsRepository`, `InviteChannel` simulasi di SQLite, migrasi v2: `invitations`, `session_criteria`), `flows/progress.service.ts` (penggerak langkah sistem: idempoten, diserialkan per sesi, membaca chain sebagai sumber kebenaran), `flows/editorial.service.ts`, `flows/reviews.service.ts`, `flows/assignments.controller.ts` (`GET /invitations`, `POST /flows/assignments/{editor,bind}`, `/flows/editorial-screening`, `/flows/reviews/{commit,reveal}`, `POST /system/sessions/:id/progress`), `public/audit-trail.service.ts` (kronologi dari log kontrak, jendela blok), `public/projection.service.ts`. `GatewayService` dan `SessionReader` diperluas.
  - **`packages/shared`**: `selection.ts` (`criteriaHash`, `inviteRef`, `proofRefOf`, konstanta D2), `documents.ts` (dokumen telaah dan laporan editorial yang deterministik, sama di klien dan server), `ReviewPhase`/`DecisionOutcome`/nama rekomendasi di `status.ts`, `signals.assignment`.
  - **zk-sim**: pemeriksa `ASSIGNMENT` (kriteria cocok hash publik, anggota terdaftar, kredensial bidang sah dari penerbit untuk bidang dalam kriteria, salt cocok commitment). Tidak ada lagi jenis bukti yang 501 selain NoteBind/NoteRefund/ReputationBucket/ReputationClaim/SelectiveDisclosure.
  - **Hasil `demo:m4`:** editor dan 3 penelaah terpilih dari pool terdaftar; penulis (akun penelaah) dikecualikan; 4 berkas bukti penugasan di storage punya keccak256 = `proofRef` on-chain dan lolos `SimulatedZkVerifier.verify`; ditolak: editor lain merebut undangan (`ASSIGNMENT_NOT_OWNED`), bukti palsu, penerimaan ulang, laporan dimanipulasi, pseudonim bukan editor, Proceed tanpa bidang, penelaah tak diundang merebut penugasan, pengikatan ulang ke pseudonim lain (`AssignmentAlreadyBound`), commit sebelum fase Commit, commit ganda, reveal sebelum semua commit, reveal dengan isi/rekomendasi berbeda (isi palsu tidak pernah diunggah). Audit trail: 39 event urut menurut blok dan indeks log, jejak status `UnderAnonymization → UnderEditorialScreening → AssigningReviewers → UnderReview → Accepted → Published`. Pemindaian 30 transaksi: tanpa commitment identitas, alamat akun permanen, secret, salt undangan, nama, atau surel.
  - **"Server tidak pernah menerima rekomendasi sebelum reveal"** dibuktikan tiga lapis: (1) DTO commit hanya memuat `commitHash` dan `ValidationPipe` membuang field lain (tes `ReviewsService`), (2) `Api.trace` pada demo merekam isi semua permintaan klien: permintaan commit hanya berkunci `action,signature`, tanpa `recommendation`/`reviewNonce`/teks, (3) reveal ditolak 409 selama fase belum Reveal.
  - **Tes:** `npm test` lulus seluruhnya: kontrak 191, shared 22 (+7 `documents.test.ts`), storage-sim 19, zk-sim 19 (+6 ASSIGNMENT), **server 57** (+26: `p05-p07.test.ts` 23 untuk seleksi, driver sistem, commit/reveal, editorial; +3 HTTP). `npm run typecheck` bersih. Regresi `demo:m1`, `demo:m2`, `demo:m3`, `check-wiring` (60/60) tetap lulus.

- **M5 selesai.** Semua kriteria terpenuhi dan dijalankan sendiri (`npm run demo:m5`, node Hardhat sungguhan, proses nyata, tanpa mock; dijalankan 4 kali berturut-turut karena seleksinya acak, semuanya lulus):
  - **Konsep ronde.** Satu ronde = batch-batch yang keputusannya diagregasi bersama. Batch k bergabung ke ronde batch k+1 bila keputusan k adalah zona abu-abu atau k ditinggalkan; keputusan non-abu-abu menutup ronde. Dihitung dari chain (keputusan) dan DB (undangan), tanpa state tambahan (`flows/rounds.service.ts`).
  - **Revisi** (`manuscripts/revision.service.ts`, tabel `manuscript_revisions`, berkas privat di `manuscripts/<id>/rev<n>/`): `POST /manuscripts/:id/revisions/intake` (multipart; anonimisasi sama dengan P04, `metadataHash` bersalt baru, identitas disalin dari revisi sebelumnya) lalu `POST /flows/revision` (aksi `RecordRevision` bertanda tangan pseudonim Author; naskah anonim diunggah ke storage publik sebelum transaksi, CID dicocokkan). Hanya saat `Minor/MajorRevisionRequired`, hanya pemilik. Hash on-chain berubah (asli, anonim, metadata, URI, `revisionCount`); PDF anonim revisi terunduh dari storage dengan sha256 = on-chain.
  - **Minor** → `AssigningReviewers` → batch baru berisi orang yang sama (yang reveal di ronde lalu), pseudonim baru (slot = nomor batch), fase Commit dibuka ulang. **Major** (dan revisi desk) → `UnderEditorialScreening` dengan editor yang sama (tanpa undangan editor baru); setelah Proceed, ronde penelaah baru dipilih acak. **Zona abu-abu** → batch tambahan 2 orang baru, keputusan batch berikutnya diagregasi atas seluruh pseudonim ronde (demo: 3 Accept, 1 Minor, 1 Reject atas 5 pseudonim → `AcceptAsIs`). **Desk reject** → `Rejected` tanpa penelaah; sistem diam, revisi 409.
  - **Penelaah tidak merespons** (`POST /admin/sessions/:id/close-phase`, admin): Commit sebagian → buka Reveal bagi yang commit; Reveal sebagian → tutup, keputusan atas yang reveal (D3, demo: `reviewerCount` 2); nol commit/nol reveal → batch ditinggalkan (undangan `voided`, orangnya tidak diundang lagi di ronde itu), `UnderReview → AssigningReviewers` (transisi yang sah di kontrak lewat `updateStatus`), batch pengganti dengan jumlah sama.
  - **Server:** `ProgressService` diperluas (cabang pasca-keputusan, `closePhase`, `blocked`), `SelectionService.inviteReviewers` menerima `prefer`/`exclude`, `InvitationsRepository` punya `voided_at`, proyeksi publik menambah `decisions` (keputusan tiap batch) dan `review.roundBatches`, telaah mencakup seluruh ronde. Migrasi v3.
  - **Hasil `demo:m5`:** tujuh jalur mencetak jejak status dari event on-chain, semua persis sesuai diagram:
    - A Minor: `UnderAnonymization → UnderEditorialScreening → AssigningReviewers → UnderReview → MinorRevisionRequired → AssigningReviewers → UnderReview → Accepted → Published`
    - B Major: `… UnderReview → MajorRevisionRequired → UnderEditorialScreening → AssigningReviewers → UnderReview → Accepted → Published`
    - C Abu-abu: `… UnderReview → AssigningReviewers → UnderReview → Accepted → Published`
    - D Desk reject: `UnderAnonymization → UnderEditorialScreening → Rejected`; revisi desk: `… → MajorRevisionRequired → UnderEditorialScreening → AssigningReviewers`
    - E1 satu no-show dan E2 semua no-show (batch pengganti): jejak seperti diagram.
    Negatif yang ditolak: revisi saat `UnderReview` (409), penulis lain (404), bukan PDF (400), pengajuan tanpa intake (409), aksi dimanipulasi (400), tanda tangan kunci lain (`InvalidSignature`), revisi ganda, revisi pada `Rejected`, commit ulang oleh pseudonim batch lama, commit oleh penelaah yang dikecualikan, penelaah/editor menutup fase (403), menutup fase pada sesi selesai (409). Pemindaian 236 transaksi (termasuk revisi): tanpa identitas, secret, salt undangan, nama, atau surel.
  - **Tes:** `npm test` lulus seluruhnya: kontrak 191, shared 22, storage-sim 19, zk-sim 19, **server 90** (+33: `m5.test.ts` 31 untuk ronde, pemilihan abu-abu/Minor/Major/pengganti, batas 10, `closePhase`, `RevisionService`, repositori; +2 HTTP). `npm run typecheck` bersih. Regresi `demo:m1`-`demo:m4` dan `check-wiring` (60/60) tetap lulus.
  - Klien skrip: `Member.intakeRevision/submitRevision`; data commit tertunda kini berkunci sesi+slot (satu orang punya beberapa ronde di sesi yang sama; frontend M11 harus sama). Pustaka alur bersama `scripts/lib/flow.ts` (dipakai M12).

- **M6 selesai.** Semua kriteria terpenuhi dan dijalankan sendiri (`npm run demo:m6`, node Hardhat sungguhan, zk-sim sungguhan lewat HTTP, tanpa mock; setelah dua perbaikan kecil pada skripnya sendiri dijalankan 3 kali berturut-turut pada node yang sama, semuanya lulus):
  - **Kontrak** (`contracts/contracts/hugo/`, solc 0.8.28, tanpa viaIR, tanpa stack-too-deep):
    - `EscrowPool` (dipecah dari `createBatch` Hugo): `deposit(noteCommitment)` nominal tetap (APC 0,01 ETH, D6), `bindNote(sesi, nullifier, bukti NoteBind)`, `refund(sesi, alamatBaru, nullifier, bukti NoteRefund)`, `creditRewards` (hanya engine, jumlah wajib tepat sama dengan escrow), `claimReward(sesi, pseudonim, alamatBaru, tanda tangan EIP-712)`. `refundable` dan `distributable` dihitung murni dari keadaan kontrak Ciko, saling lepas: refund bila belum ada keputusan dan (Rejected tanpa batch penelaah, atau macet > `idleTimeout`); dibagikan bila ada keputusan dan (Accepted/Published/Rejected, atau macet). "Macet" = `updatedAt` sesi lebih lama dari `idleTimeout` (90 hari). Penjaga solvabilitas: ikatan tidak boleh melebihi setoran (`unboundNotes`). Tanpa `receive()`/fallback.
    - `IncentiveEngine`: `_topsis`, `_sigmoid`, `_sqrt` Hugo dipertahankan tanpa perubahan; `executeDistribution(DistributionInput)` (struct, supaya tidak stack-too-deep) hanya operator, berbasis `sessionId`, baris matriks = pseudonim yang `hasReveal` (D3), jumlah bobot tepat 1e18, nilai matriks <= 1e18, 1-10 baris (D2), tanpa pseudonim ganda, sisa pembulatan masuk ke sigmoid tertinggi, hash laporan QoS dan hash kebijakan dicatat. Engine tidak memegang dana.
    - `ReputationSBT`: kunci `bytes32 reputationId`; engine hanya menambah kredit agregat (`accrue`); mint lewat `claimReputation(Claim[])` bertanda bukti `ReputationClaim` (nullifier, kelipatan 0,25, total klaim <= total kredit, dapat digabung relayer dalam satu transaksi); decay tidak bisa dihindari (lihat Temuan); `setDecayRate` kini terjangkau (admin).
    - `IVerifierSource`: Hugo membaca verifier lewat `ActionGateway.verifier()`, jadi `setVerifier` tetap satu tempat.
  - **Wiring.** `Integrated.ts` men-deploy tiga kontrak Hugo dan memasang `setEngine`; parameter satu sumber di `contracts/hugo-params.ts` (`APC_AMOUNT_WEI`, `ESCROW_IDLE_TIMEOUT_SECONDS` menimpa). `check-wiring`: **83/83 lulus** (23 baru: engine, pool, SBT, verifier, operator, parameter). Diuji negatif: `APC_AMOUNT_WEI=5` membuat pemeriksa gagal (82/83, kode 1).
  - **`packages/incentive-core`** (baru, direncanakan M7 tetapi dibutuhkan tes D1): salinan `normalization`, `weighting/{bwm,ecwm,fusion}`, `topsis`, `sigmoid` Hugo tanpa perubahan rumus, ditambah `onchain.ts` (konversi ke 1e18, `weightsToE18` menjamin jumlah tepat 1e18, **model referensi bilangan bulat** yang meniru `_topsis`/`_sigmoid`/pembagian kontrak persis), `datasets.ts` (D1-D3), `presets.ts`, `pipeline.ts`. Tes (8) mereproduksi Lampiran A (R1 0,7056 ETH off-chain) dan Lampiran B (R1 0,6453 ETH) **tanpa EVM**.
  - **`packages/shared`**: `notes.ts` (rahasia note, `noteCommitment`, nullifier ikat dan refund, domain dan `signClaimReward`, nullifier klaim reputasi), `signals.noteBind/noteRefund/reputationClaim`, ABI 14 kontrak.
  - **`services/zk-sim`**: pemeriksa witness `NOTE_BIND` (rahasia note menurunkan nullifier, note ada di pool, belum dibelanjakan) dan `NOTE_REFUND` (rahasia pemilik note yang terikat ke sesi itu, nullifier refund turunan rahasia dan sesi, penerima sah). Tanpa `EscrowPool` terkonfigurasi: 501 `ESCROW_NOT_CONFIGURED`. Sisa yang 501: `ReputationBucket` dan `ReputationClaim` (M7), `SelectiveDisclosure` (M8).
  - **Tes:** `npm test` lulus seluruhnya: kontrak **252** (191 + 17 `EscrowPool`, 25 `IncentiveEngine`, 17 `ReputationSBT`, 1 gas, +1 untuk `hugo-helpers.ts` yang dihitung `node:test` sebagai berkas; ini mengonfirmasi dugaan M2 tentang selisih 1), shared 22, **incentive-core 8**, storage-sim 19, **zk-sim 30** (+11), server 90. `npm run typecheck` bersih. Regresi `demo:m1`-`demo:m5` lulus terhadap deployment baru yang sudah memuat kontrak Hugo.
  - **Pemetaan tes Hugo (23 kasus `IncentiveEngine.test.ts` + 9 gas):** deployment (2), distribusi (execute, double, non-owner, ETH ke penelaah, mint SBT, no-show dikecualikan, ranking vs off-chain, n=2, n=10), SBT (mint, akumulasi, decay, reset timer, trigger, tanpa decay), perbandingan on/off-chain: semuanya dipetakan (komentar `Hugo:` di tiap tes), dengan penyesuaian rancangan. Empat tes `createBatch` Hugo (escrow 0, >10 penelaah, 0 penelaah) tidak ada padanan karena `createBatch` dibuang; padanannya: `deposit` hanya menerima tepat APC, dan n=0 dan n=11 ditolak engine. Tes "all no-show refund to author" Hugo menjadi timeout refund (tes `EscrowPool`). `gas.test.ts` diport (`Gas.test.ts`, n=2..10).
  - **Hasil `demo:m6`** (semua OK, 101 transaksi dipindai):
    - A. Siklus penuh D1 di chain: setor, ikat, 5 penelaah Accept, distribusi. Imbalan skala 2 ETH = **R1 0,6453 / R2 0,4888 / R3 0,1053 / R4 0,5814 / R5 0,1793** dan reputasi 0,8729 / 0,6612 / 0,1424 / 0,7865 / 0,2425, **sama dengan Tabel B.2 Hugo sampai 4 desimal**; peringkat R1 > R4 > R2 > R5 > R3. Klaim ke 5 alamat baru (saldo awal 0), seluruh APC sampai tanpa sisa; reputasi diklaim atas `reputationId`.
    - B. Refund dini (P03 Reject): APC penuh ke alamat baru; sebelum ditolak, refund kedua, dan pengalihan penerima oleh relayer ditolak. C. Timeout refund: ditolak sebelum 90 hari, berhasil sesudahnya. D. Revisi macet: dana ditolak dibagikan sebelum timeout, dibagikan ke 3 penelaah sesudahnya.
    - E. Ditolak on-chain: replay nullifier ikat (`NullifierAlreadyUsed`), bobot +1/-1 wei (`WeightsMustSumToOne`), matriks 1e18+1 (`InvalidMatrixValue`), pseudonim tanpa reveal (`PseudonymNotRevealed`), pseudonim ganda, bukan operator, `creditRewards` langsung, bukti bertanda tangan bukan attestor (`InvalidProof`), distribusi kedua, refund setelah ada keputusan, klaim dua kali, penerima dialihkan, pseudonim lain mengklaim; dari zk-sim: note tak pernah disetor, note terpakai, bukan pemilik note.
    - F. Decay: reputasi dipicu `triggerDecay` tiap 12 jam selama 5 hari = yang dibiarkan = 0,6779 (bukan 0,75).
    - G. Pemindaian 101 transaksi: tanpa rahasia note, alamat penyetor, atau rahasia/commitment identitas; commitment note hanya di transaksi setor; transaksi refund dan mint tanpa penyetor, note, pseudonim, atau id sesi.
  - **Uji mutasi** (karena hasil lulus pada percobaan pertama): kontrak sengaja dirusak dan tes harus gagal. Tanpa cek `hasReveal`: 3 tes gagal. Refund walau ada keputusan: 2 tes gagal. `triggerDecay` mereset penanda waktu ke sekarang (perilaku Hugo): 3 tes gagal. Mutasi pertama yang saya tulis (mereset di `_settle`) ternyata tidak mereproduksi bug Hugo dan hanya ditangkap satu tes; itu sebabnya mutasi kedua dibuat setia ke kode Hugo.
  - **Gas** (jaringan Hardhat, optimizer 200 runs seperti Hugo): `executeDistribution` n=2..10 = 350k, 411k, 505k, **599k (n=5; Hugo 603.214 untuk TOPSIS + sigmoid + transfer + mint)**, 679k, 759k, 839k, 920k, 1.001k; pada demo 601.619. `deposit` 73k, `bindNote` 187k, `claimReward` 74k, `claimReputation` 117k, `refund` 146k. Biaya per penelaah pindah dari satu transaksi operator ke `claimReward` yang dibayar relayer.

## Tersisa

Milestone berikutnya: **M7, insentif di backend** (`SimulatedQoSProvider`, kebijakan bobot per jurnal dikunci saat sesi dibuat, q1 dari timestamp on-chain, q4 dari bukti tingkat, penyelesaian otomatis, `ESCROW_REQUIRED=true`, refund di jalur P03/P05, klaim imbalan dan reputasi per epoch, timeout otomatis). M7 sampai M13 belum dikerjakan.


## Temuan di lapangan (M0)

Tidak ada yang bertentangan dengan `arsitektur.md` atau `analisis/`. Catatan:

- **Risiko "Hardhat 3 di Node 24" (bagian 13) tertutup.** Kompilasi, tes, node, dan Ignition semua jalan di Node 24.11.0 tanpa `nvm`. Hardhat terpasang 3.x (`hardhat --version` mencetak 3.21.2), solc 0.8.28 diunduh otomatis pada kompilasi pertama (butuh internet sekali).
- **Jaringan `localhost` harus dideklarasikan** di `hardhat.config.ts` (tipe `http`). Sudah ditambahkan, URL dari `RPC_URL`. Jaringan `hardhatMainnet`/`hardhatOp` dan profil `production` (viaIR) milik Ciko tidak dibawa. viaIR baru ditambahkan bila `ActionGateway` kena stack too deep (M2).
- **Perintah tes** Ciko `hardhat test test/*.test.ts` diganti `hardhat test nodejs` karena tes dipindah ke `test/ciko/`.
- **Deploy ulang ke node yang dimulai ulang** memakai `--reset` pada `deploy:local`, supaya jurnal Ignition lama tidak dipakai. Sepolia sengaja tanpa `--reset`.
- **Operator di M0 adalah akun indeks 1** (`OPERATOR_ACCOUNT_INDEX`). Ini sementara. Di M2 operator diganti `ActionGateway`.
- `npm install` melaporkan 12 kerentanan "high" pada rantai dependensi dev (Hardhat dan turunannya). Belum diperiksa. Tidak memengaruhi demo lokal, tetapi perlu dilihat sebelum M13.

## Temuan di lapangan (M1)

Tidak ada yang bertentangan dengan `arsitektur.md` atau `analisis/`. Catatan:

- **Pemeriksaan "di browser" dilakukan lewat curl**, meniru persis form HTML (multipart ke `/upload`, GET `/?cid=`). Tampilan di browser sungguhan belum dilihat mata. Halaman tanpa JS/CSS, jadi risikonya kecil, tetapi silakan buka http://127.0.0.1:8081 sekali untuk memastikan.
- **Status galat dipilih sendiri** (tidak ditentukan dokumen): CID tak sah 400, CID sah tetapi tak dikenal 404. Kubo berperilaku berbeda untuk CID tak dikenal (menggantung mencari ke jaringan), jadi `HttpStorageProvider` memakai timeout (15 dtk, bisa diatur) dan tes eksternal memakai 8 dtk.
- **Penerapan catatan CID (arsitektur bagian 11) terbukti**: berkas 1,1 MB akan jadi DAG di Kubo, sedangkan simulator tetap satu blok raw. Karena itu `cidOf` lewat provider adalah satu-satunya cara yang benar menghitung CID, dan verifikasi hash di klien hanya untuk CID raw.
- **Tata letak paket:** `@decpub/shared` diekspor langsung dari `src/*.ts` (dijalankan lewat `tsx`, tanpa langkah build). Frontend Next.js (M9) nanti perlu `transpilePackages: ["@decpub/shared"]`.
- `STORAGE_DATA_DIR` bawaan relatif ke direktori kerja proses (`../../data/storage` dari `services/storage-sim`), jadi hasilnya `integrated/data/storage` (masuk `.gitignore`). Warning `../../.env not found` saat start tidak berbahaya.

## Temuan di lapangan (M2)

Tidak ada yang bertentangan dengan `arsitektur.md` atau `analisis/`. Keputusan kecil yang saya ambil sendiri (semuanya di dalam batas dokumen; mohon dikoreksi bila tidak setuju):

- **Konstruktor `EphemeralAccounts` tidak lagi menerima alamat `PermanentAccounts`.** Arsitektur bagian 9 hanya menyebut "hapus cek commitment permanen dan keunikan global". Menghapus ketergantungannya sekalian membuat ketaktertautan struktural (kontrak itu tidak punya jalan membaca akun permanen). Akibatnya: argumen konstruktor di 9 berkas tes Ciko dan modul Ignition ikut berubah, dan 3 tes Ciko yang menguji perilaku lama diganti (`CommitmentAlreadyUsedGlobally`, `PermanentAccountNotRegistered`, `isCommitmentUsedGlobally`).
- **Definisi nilai pseudonim** (belum ditetapkan dokumen): `pseudonymKey = H(secret, sesi, peran, slot)`, `nullifier = H(secret, sesi, peran, slot)`, `sessionCommitment = H(secret, sesi, peran, slot, pseudonim)`, semuanya hash berdomain. `slot` = 0 untuk penulis dan editor, nomor batch untuk penelaah (pseudonim baru tiap putaran, B3). Kunci pseudonim turunan dari secret, jadi bisa dipulihkan di browser. Nullifier dicatat di gateway, bukan di `EphemeralAccounts`.
- **Kredensial peran** = tanda tangan penerbit (kunci `ISSUER_PRIVATE_KEY`) atas `(identityCommitment, peran)`, dipakai hanya sebagai witness. Di M3 server memegang kunci penerbit. Kredensial bidang keahlian menyusul di M3.
- **`bindAssignment` dipisah dari `createEphemeralWithProof`** (jenis bukti `ASSIGNMENT_OWNERSHIP`, sesuai tabel 8.2). `assignmentOwner[sesi][commitment]` menutup celah Ciko; `commitReviewSigned` dan `revealReviewSigned` menolak pseudonim yang bukan pemilik. Ini diuji di EVM.
- **`createEphemeralWithProof` dan `bindAssignment` boleh dikirim siapa saja**, bukan hanya operator: bukti mengikat semua parameter, jadi relayer tidak bisa mengubah apa pun, dan pengguna bisa mengirim sendiri. Aksi sistem tetap khusus operator.
- **"Secret salah ditolak on-chain" ditafsirkan** sebagai: zk-sim menolak membuat bukti (`IDENTITY_NOT_REGISTERED`), dan bukti palsu yang ditandatangani kunci lain ditolak chain (`InvalidProof`). Pada simulasi, chain tidak bisa melihat secret; hanya tanda tangan attestor yang diperiksa. Pemeriksaan secret terjadi di attestor.
- **Gateway memeriksa nullifier sebelum bukti.** Bukti yang sah tetapi nullifier-nya sudah dipakai ditolak `NullifierAlreadyUsed`, bukan `InvalidProof`. Itu urutan yang dipilih; demo menyiasati dengan nullifier segar untuk kasus "peran salah" dan "sesi salah".
- **Kunci attestor dan penerbit di lokal diturunkan dari label di kode** (`devPrivateKey`) sehingga `npm run demo` jalan tanpa konfigurasi. Kunci itu publik, hanya sah di `NETWORK=localhost`. `loadPrivateKey` melempar galat bila `NETWORK` bukan lokal dan env kosong. Wajib diisi untuk M13.
- **Jenis bukti `ASSIGNMENT` (2) belum punya pemeriksa maupun fungsi gateway.** Arsitektur 8.2 menyebutnya untuk P05/P06, tetapi 8.1 tidak memetakan fungsi gateway mana pun ke jenis itu. Dibiarkan 501 sampai M4 (seleksi) agar konteksnya jelas. (M4: terisi, bukti dibuat server; lihat temuan M4.)
- **Klaim "ketaktertautan dibuktikan" dibatasi.** Pemindaian kebocoran membuktikan sistem baru bersih. Kode Ciko asli tidak dijalankan untuk memperlihatkan bocornya (temuan arsitektur bagian 14 butir 1 masih hasil baca kode).
- **Jebakan viem:** `getBlockNumber()` di-cache sekitar satu interval polling, sehingga pemindaian blok di demo sempat memindai 0 transaksi dan lulus palsu. Kini `cacheTime: 0`. Skrip lain yang membaca tinggi blok perlu memperhatikan ini.
- Tes Hardhat bisa mengimpor `@decpub/shared` (TS workspace) tanpa langkah build, jadi tes kontrak, zk-sim, dan demo memakai kode kripto yang sama dengan yang nanti dipakai frontend.

## Temuan di lapangan (M3)

Tidak ada yang bertentangan dengan `arsitektur.md` atau `analisis/` pada tingkat desain. Penyimpangan kecil dan keputusan yang saya ambil sendiri (mohon dikoreksi bila tidak setuju):

- **Kontrak menolak `Incomplete -> Incomplete`** (`InvalidStatus`, karena `prev == new`). Pengecekan ulang harus lewat `updateStatus(UnderAutomaticChecking)` dulu; `advance {recheck}` melakukannya. Dengan berkas yang sama hasilnya tetap `Incomplete` (dan batch bertambah). Seperti tertulis di arsitektur bagian 2, `Incomplete` tidak punya jalan keluar kecuali sesi ditutup dan penulis mengajukan ulang; jalur penutupan + refund menunggu M7.
- **Hanya PDF yang diterima.** Ciko menerima DOCX tanpa anonimisasi. Di sini DOCX ditolak 400, karena pengecekan, anonimisasi, plagiarisme, dan pemindaian identitas semuanya bergantung pada PDF.
- **`identityExposed` didefinisikan ulang.** Di Ciko = "metadata Author ada" (selalu true pada berkas asli dan dihapus P04, jadi tak berguna sebagai peringatan). Sekarang = nama/surel/afiliasi penulis (dari formulir) masih terbaca di isi PDF anonim. Hanya peringatan; laporan publik hanya memuat jenis field, bukan nilainya. Aturan `Incomplete` tetap memakai metadata PDF (judul + kata kunci, subjek) seperti Ciko.
- **PDF yang tak terbaca ditolak 400 saat intake** (anonimisasi butuh memuatnya), sehingga `Reject` format tidak pernah sampai chain; `Reject` on-chain berasal dari plagiarisme dan batas halaman (<100).
- **Ekstraksi teks PDF buatan sendiri** (`pdf/pdf-text.ts`, mengurai operator `Tj`/`TJ`). Cukup untuk PDF font standar (sampel, pdf-lib); untuk PDF dengan font tertanam ber-encoding khusus bisa kosong, sehingga plagiarisme dan `identityExposed` bisa terlewat (galat negatif). Pengganti: pdf.js.
- **Akun permanen dompet dev = turunan secret** (`permanentAccountAddress`), supaya pengguna tanpa MetaMask tetap punya alamat untuk `PermanentAccounts`. Alamat ini tertaut ke identitas by design; pseudonim sesi tidak. Registrar = deployer (admin `PermanentAccounts` immutable), operator = akun lain; keduanya dari `eth_accounts` di lokal, kunci privat di Sepolia.
- **Endpoint pembuatan pseudonim tanpa JWT** (sengaja): bukti mengikat semua parameter dan server tidak boleh bisa menautkan pseudonim ke akun. Konsekuensi untuk M10: browser memanggil zk-sim langsung (butuh CORS di zk-sim) atau lewat proksi tanpa JWT.
- **Penelaah yang mendaftar** otomatis membuat permintaan verifikasi bidang; kredensial `Reviewer` baru terbit setelah admin menyetujui. Akun penelaah juga boleh mengajukan naskah (kredensial Author); pengecualian dari naskahnya sendiri diterapkan di seleksi (M4).
- **Penyimpangan skema:** peran akun bernama `author` (Roihan: `user`) dan ada `admin`; password di-hash dengan scrypt `node:crypto` (Roihan: bcrypt); seed 6 penelaah, 3 penulis, 1 admin, 4 editor (tanpa wallet seed Roihan). Akun seed hanya dibuat bila `SEED_DEMO_ACCOUNTS` (bawaan menyala hanya di jaringan lokal).
- **Anonimisasi tidak diubah** (B1), termasuk tanggal ModDate yang diisi pdf-lib; hasil anonim dihitung sekali saat intake dan disimpan di staging, jadi bytes yang dicatat on-chain = bytes yang diunggah.
- `node:sqlite` bekerja di Node 24 (peringatan "experimental" saat start); risiko "`node:sqlite` di NestJS" (bagian 13) tertutup, `better-sqlite3` tidak diperlukan.
- Proses uji `pkill -f` pernah mematikan shell sendiri; hentikan layanan lewat PID.

## Temuan di lapangan (M4)

Tidak ada yang bertentangan dengan `arsitektur.md` atau `analisis/` pada tingkat desain. Keputusan kecil yang saya ambil sendiri, dan hal yang perlu keputusan Anda (mohon dikoreksi):

**Perlu keputusan Anda (tidak menghalangi M5):**

- **Server dapat menautkan pseudonim penelaah/editor ke orang saat menerima undangan.** Pengikatan (`/flows/assignments/bind`, `/editor`) lewat relayer: server melihat pasangan (commitment penugasan, pseudonim) sambil memproses, dan commitment sudah dipetakan ke akun lewat undangan. Server **tidak menyimpan** pseudonim (hanya chain yang menyimpannya) dan endpoint tanpa JWT, tetapi proses server tetap bisa mencatatnya. Ini konsisten dengan model Ciko (server tepercaya untuk seleksi, Lap. hlm. 95), tetapi lebih kuat daripada baris matriks 8.3 ("Server: Ya, untuk undangan") yang tidak menyebut tautan pseudonim. Opsi: (a) terima sebagai batasan dan tulis di bagian 13, (b) klien mengirim transaksi pengikatan sendiri (butuh gas, dompet baru), (c) campur/tunda pengikatan. Saya pilih (a) sementara.
- **Pembuatan pseudonim tidak dibatasi undangan.** Siapa pun dengan kredensial peran sah bisa membuat pseudonim Editor/Reviewer di sesi mana pun (mereka tidak bisa ditugaskan tanpa salt undangan, tetapi event `EphemeralAccountCreated` tercatat). Demo menunjukkannya: dua pseudonim Editor muncul di audit trail, satu milik percobaan merebut undangan. Memberi batas (mis. hanya setelah undangan diterima) berarti mengubah `ActionGateway`; belum saya lakukan.

**Keputusan kecil yang saya ambil:**

- **Bukti `ASSIGNMENT` dibuat server, bukan klien.** Witness-nya hasil seleksi server (sesuai tabel 8.2). Bukti diunggah ke storage publik; `proofRef` on-chain = keccak256 berkas. Kontrak Ciko hanya menyimpan `proofRef` dan tidak memverifikasinya, jadi pemeriksaan dilakukan publik lewat `SimulatedZkVerifier.verify` (diuji di demo). `GET /public/sessions/:id/assignment-proofs` memetakan commitment ke berkas bukti, tanpa identitas.
- **Editor juga memakai `ASSIGNMENT_OWNERSHIP`** untuk menerima undangan (tabel 8.2 hanya menyebutnya untuk P06). Server memverifikasi buktinya lewat `verify` on-chain (view) sebelum `assignEditor`.
- **`recordReviewerCriteria` dipanggil setelah putusan Proceed** (status sudah `AssigningReviewers`, masih diizinkan kontrak). Kriteria berasal dari laporan editor yang hash-nya ditandatangani, jadi server tidak bisa mengubahnya diam-diam. Bawaan bila editor tidak mengisi: bidang kategori jurnal.
- **Laporan editorial dua versi**: publik (`anonymousEditorialReportHash`, CID di storage) dan lengkap dengan `privateNotes` (`editorialReportHash`, hanya di storage privat terenkripsi). Isi telaah juga dokumen deterministik tanpa rekomendasi; rekomendasi hanya ada di reveal.
- **Reveal: isi telaah diunggah server, bukan klien**, setelah memeriksa fase Reveal, kecocokan dengan commit, dan hash/CID isi. Isi palsu atau sebelum waktunya tidak pernah menyentuh storage publik. Teks ini juga yang dibaca QoS di M7.
- **Langkah sistem tertunda tidak menggagalkan pengajuan.** Sebelumnya `demo:m3` gagal 409 saat belum ada editor terdaftar. Sekarang `AdvanceResult.notes` memuat "P05 tertunda: ..." dan sesi tetap sah di `UnderEditorialScreening`. Tidak ada percobaan ulang otomatis bila editor baru mendaftar; gunakan `POST /system/sessions/:id/progress`.
- **`Accepted` langsung dilanjutkan ke `Published`** oleh `ProgressService`. M8 akan menyisipkan DOI, `recordFinal`, dan `recordDisclosure` sebelum/sekitar `updateStatus(12)`; titik sambungnya `ProgressService.publish`.
- **Audit trail membaca log dari `LOG_FROM_BLOCK` ke ujung rantai tiap permintaan** (jendela `LOG_WINDOW`, tanpa cache log). Cukup untuk lokal; di Sepolia isi `LOG_FROM_BLOCK` dengan blok deploy dan pertimbangkan cache (M13).
- **Proyeksi publik dibatasi per fase**: isi dan rekomendasi telaah tampil di `/public/sessions/:id` hanya setelah fase `Closed`. Event on-chain tetap publik di ledger (tak bisa dibatasi), jadi ini batas proyeksi API, bukan jaminan kerahasiaan.
- **Percobaan reveal dini yang disengaja pada demo** mengirim rekomendasi ke server (ditolak 409). Itu perilaku penyerang/klien salah, bukan klien yang benar, jadi dikecualikan dari analisis "isi permintaan" di demo; bukti server menolaknya ada di tes `ReviewsService`.
- **`pendingReviews` pada klien** (data pembukaan commit) disimpan hanya setelah commit diterima. Bug awal di skrip demo: commit ganda yang ditolak menimpa nonce yang sah. Frontend (M11) harus berperilaku sama dan menyimpan data ini di penyimpanan lokal browser.

## Temuan di lapangan (M5)

Tidak ada yang bertentangan dengan `arsitektur.md` atau `analisis/`. Keputusan Anda dan keputusan kecil yang saya ambil sendiri (mohon dikoreksi):

**Keputusan Anda (2026-11-05):**

- **Zona abu-abu yang menembus batas 10 penelaah per ronde** (D2): otomatis `Rejected`. Tambahan penelaah dibatasi agar total tidak melebihi 10; bila kapasitas habis dan masih tanpa mayoritas, `ProgressService` memanggil `updateStatus(UnderReview)` lalu `updateStatus(Rejected)` (kontrak hanya mengizinkan `AssigningReviewers → UnderReview`, dan `Rejected` dicapai dari `UnderReview`), sehingga jejaknya `… AssigningReviewers → UnderReview → Rejected`. Ini diuji di tes unit (`m5.test.ts`); belum didemokan di chain karena butuh 10 penelaah terdaftar. Penelaah tetap dibayar (aturan dana A3, M7).
- **Tenggat otomatis untuk "tidak merespons"**: ditunda ke M7 bersama timeout escrow. Sampai itu, `POST /admin/sessions/:id/close-phase` tetap pemicunya.

**Keputusan kecil yang saya ambil:**

- **Revisi Major memilih ronde penelaah baru secara acak** dan penelaah ronde lama boleh terpilih lagi (hanya penulis yang dikecualikan). B3 hanya menyebut "Minor mengundang orang yang sama"; untuk Major dokumen diam. Mengecualikan semua peserta lama membuat pool demo (6 penelaah) cepat habis.
- **Revisi Minor mengundang orang yang reveal di ronde lalu**; bila ada yang tak lagi memenuhi syarat, kekurangannya diisi acak. Jumlah = jumlah peserta (bisa 5 setelah zona abu-abu).
- **Penelaah no-show tidak diundang lagi di ronde yang sama**, tetapi tetap bisa terpilih di ronde berikutnya (setelah revisi).
- **Revisi tidak menjalankan lagi P03** (cek otomatis, plagiarisme) sesuai B3. Akibatnya naskah revisi bisa lolos tanpa pengecekan plagiarisme. Server hanya memberi peringatan `identityExposed` pada hasil intake revisi (tidak masuk chain). Ini batasan B3 yang perlu masuk bagian 13.
- **Penelaah yang tidak pernah mengikat penugasan** (tidak menerima undangan) masih menahan sesi di `AssigningReviewers`; tidak ada jalur pengganti untuk fase ini (hanya fase Commit/Reveal). Sama seperti editor yang tidak merespons. Masuk bersama timeout di M7.
- **Kontrak mengizinkan `UnderReview → AssigningReviewers` lewat `updateStatus`** (`PublicationSessions._isValidTransition`), dipakai untuk meninggalkan batch. Batch yang ditinggalkan tetap tercatat di chain (`ReviewerSelectionBatchRecorded`, commit tanpa reveal) dan tidak punya keputusan; penanda "ditinggalkan" hanya di DB server (`voided_at`), jadi audit trail on-chain saja tidak membedakannya dari batch yang masih menunggu. Bila perlu bisa dijadikan event, tetapi itu mengubah `ActionGateway`.
- **`decision` di proyeksi publik adalah keputusan batch terakhir**, sehingga sesaat setelah zona abu-abu nilainya `null` (batch tambahan sudah tercatat). Daftar lengkap ada di `decisions`. Bug awal di skrip demo bersumber dari sini.
- Telaah yang tampil publik mencakup seluruh ronde, tersembunyi selama fase Commit batch tambahan (supaya telaah sebagian tidak bocor); event on-chain tetap publik.
- Pendaftar revisi memakai JWT pemilik naskah (seperti pengajuan awal) sekaligus tanda tangan pseudonim; server tahu akun mana yang merevisi, tidak tahu pseudonim mana yang dipakai selain yang sudah ada di chain.
- `pkill -f` pada nama proses Hardhat mematikan shell sendiri (sama seperti catatan M3); hentikan node lewat PID.

## Temuan di lapangan (M6)

Tidak ada yang bertentangan dengan `arsitektur.md` atau `analisis/` pada tingkat desain. Dua hal yang tadinya inferensi analisis kini terbukti, satu hal bergeser dari rencana, dan ada tiga keputusan yang saya minta dari Anda.

**Terbukti (sebelumnya inferensi di `analisis/hugo.md`):**

- **Decay Hugo bisa dihindari.** Kontrak Hugo asli tidak dijalankan, tetapi mutasi kontrak baru yang mereset penanda waktu di `triggerDecay` (perilaku Hugo) membuat tiga tes penghindaran gagal, dan versi yang diperbaiki lulus. Perbaikan: penanda hanya maju sebesar hari penuh yang sudah dipotong, sisa jam tidak hilang.
- **Sigmoid kontrak bukan logistik, dan angka Lampiran B memakainya.** Model bilangan bulat TypeScript dan EVM menghasilkan angka identik bit demi bit untuk n = 1, 2, 4, 7, 10, dan sama dengan Tabel B.2 (R1 0,6453). Pratinjau off-chain logistik Hugo memberi 0,7056 (Lampiran A). Hitungan ROI Sybil 0,41 (analisis hugo.md bagian 4) **belum** diukur; kini bisa lewat `distributeFixed` pada D3.
- Hugo tidak pernah memvalidasi bobot dan rentang matriks; sekarang ditolak dan diuji (bobot +/-1 wei, matriks 1e18+1).

**Bergeser dari rencana (tanpa mengubah desain):**

- **`packages/incentive-core` dibuat di M6, bukan M7.** Tes D1 dan Lampiran B butuh normalisasi, BWM, ECWM, dan fusi. Isinya salinan middleware Hugo tanpa perubahan rumus. `QoSProvider`, preset per jurnal, dan satu sumber preset BWM tetap M7 (preset yang disalin: vektor `eval-datasets.ts`, sama dengan angka laporan; lihat arsitektur 6.2).
- **zk-sim mengisi `NOTE_BIND` dan `NOTE_REFUND` di M6**, supaya demo refund tidak menandatangani langsung dengan kunci attestor. `REPUTATION_CLAIM` belum: demo dan tes M6 menandatanganinya langsung dengan attestor (diberi label di keluaran). Yang akan diperiksa M7: reputationId dari secret, pseudonim turunan, kredit di `IncentiveEngine`.
- **Optimizer 200 runs diaktifkan** di `hardhat.config.ts` (sama dengan Hugo). Tanpa itu `executeDistribution` n=5 menjadi 884k gas dan tidak sebanding dengan Lampiran B. Mengubah kompilasi seluruh proyek; 252 tes kontrak dan semua demo tetap lulus.

**Keputusan Anda (2026-11-05), semuanya menerima kondisi sekarang:** butir 1 opsi (a), butir 2 cukup dengan `setOperator`, butir 3 opsi (a). Teks asli pertanyaan dipertahankan di bawah sebagai catatan alasan. Batasannya sudah ditulis di `arsitektur.md` bagian 13.


1. **Operator menentukan daftar pseudonim `executeDistribution`.** Kontrak menolak pseudonim tanpa reveal, tetapi tidak memaksa SEMUA yang reveal ikut. Operator yang berkolusi dengan satu penelaah bisa memasukkan hanya dia, dan dia menerima 100% (satu peserta selalu 100%). Ini batasan yang sama dengan daftar `decideBatch` Ciko (arsitektur bagian 13), tetapi di sini menyangkut uang. Opsi: (a) terima dan tulis di bagian 13 (sekarang); (b) paksa jumlah pseudonim = jumlah reveal yang terhitung di keputusan ronde (rumit untuk zona abu-abu dan beberapa ronde karena `reviewerCount` batch berikutnya mencakup batch sebelumnya, dan `ReviewSubmissions` tidak punya enumerasi); (c) tambahkan hitung reveal per sesi di gateway. Saya sarankan (a) untuk sekarang, (c) bila skripsi Anda menyasar model ancaman operator tidak jujur.
2. **Dana terkunci bila operator tidak pernah mengeksekusi saat sudah ada keputusan.** Kasus tanpa keputusan sudah ditutup timeout refund, tetapi bila keputusan ada dan operator hilang, tidak ada jalur tanpa operator, jadi klaim arsitektur "dana terkunci bila operator tidak mengeksekusi ikut ditutup" hanya separuh benar. Opsi: (a) terima (sekarang); (b) setelah timeout, siapa pun boleh membagi rata ke pseudonim yang reveal (butuh enumerasi, terkait butir 1); (c) admin bisa mengganti operator (sudah ada: `setOperator`), jadi kehilangan operator dapat dipulihkan; saya anggap (c) cukup untuk demo.
3. **`Incomplete` ditutup dan di-refund** (arsitektur bagian 2: "sesi ditutup, APC di-refund"). Kontrak Ciko tidak punya penutupan, sehingga refund untuk sesi `Incomplete` baru mungkin setelah macet 90 hari. Opsi: (a) biarkan (sekarang); (b) izinkan refund langsung dari status `Incomplete` (penulis menyerah). (b) satu baris di `EscrowPool.refundable`, tetapi sesi Ciko-nya tetap hidup dan bisa dilanjutkan tanpa escrow; M7 harus menanganinya.

**Keputusan kecil yang saya ambil sendiri (mohon dikoreksi):**

- **Pool note nominal tetap dengan satu escrow per sesi.** `bindNote` hanya untuk sesi yang ada dan belum Accepted/Rejected/Published; satu note satu sesi (nullifier), satu sesi satu note. Pembuktian kepemilikan note sepenuhnya di attestor (simulasi); kontrak hanya menjaga solvabilitas. Attestor yang jahat bisa mengikat note milik orang lain; itu batasan simulasi.
- **Rahasia note hilang = APC hilang.** Tidak ada jalur penyelamatan admin, sengaja (admin yang bisa menarik dana akan merusak model kepercayaan). Frontend M10 harus mengekspor rahasia note.
- **`refund` dan `claimReward` boleh dikirim siapa saja** (seperti keputusan M2): bukti dan tanda tangan mengikat penerima. `bindNote` juga.
- **Klaim penelaah per (sesi, pseudonim) mengambil seluruh kredit sesi itu**, karena pseudonim hanya dipakai satu sesi. `claimReward` memuat `sessionId` untuk memilih kredit.
- **Event `RewardCredited` dan `claimReward` menampilkan pseudonim dan jumlahnya secara publik**, sengaja (pseudonim sudah publik sejak reveal). Yang diputus adalah tautan pseudonim ke alamat (klaim ke alamat baru) dan ke `reputationId` (mint tanpa pseudonim, per klaim).
- **Klaim reputasi dibatasi: total klaim <= total kredit agregat dan jumlah berkelipatan 0,25.** Kontrak tidak bisa tahu klaim ini milik pseudonim mana; pemeriksaan itu di attestor (M7). Konsekuensi rancangan yang perlu diputuskan di M7: kredit kecil (mis. 0,14 atau 0,24) dibulatkan ke bawah menjadi 0 dan tidak pernah bisa diklaim; pembulatan ke atas bisa melampaui kredit dan hanya dijaga oleh batas agregat. Arsitektur bagian 6.4 hanya menyebut "dibulatkan ke kelipatan 0,25".
- **Sisa pembulatan ETH masuk ke penelaah dengan sigmoid tertinggi** (di Hugo tertahan selamanya), supaya kredit tepat sama dengan escrow.
- **Waktu macet dihitung dari `updatedAt` sesi**, yang diubah setiap perubahan status dan revisi. Pihak yang bisa mengubahnya hanya operator dan tanda tangan pseudonim; penulis tidak bisa menunda tanpa batas.
- **Refund oleh timeout tidak menutup sesi Ciko.** Kontrak Hugo tidak bisa mengubah status. Bila sesi terus berjalan sampai keputusan setelah refund, penelaah tidak dibayar (`NotDistributable`, state escrow `Refunded`). Server (M7) harus menutup sesi dan berhenti memajukannya setelah refund.
- **Sesi `Rejected` yang punya batch tetapi tanpa keputusan** (tidak terjangkau alur normal) hanya bisa di-refund lewat timeout.
- **Revisi macet memakai `idleTimeout` yang sama (90 hari)**, bukan timeout terpisah.
- **Hugo "pratinjau off-chain disamakan" (D5):** tersedia `sigmoidOnChainFloat` dan `distributeOnChainFloat` (cocok dengan model bilangan bulat sampai 1e-9). Pratinjau server M7 harus memakainya, bukan `distribute` logistik.
- **`demo:m6` memajukan jam chain > 180 hari.** Ini permanen untuk node yang sedang berjalan; semua demo lain tetap lulus sesudahnya (diuji), tetapi q1 (M7) dihitung dari timestamp, jadi jalankan ulang node bila perlu.

## Masalah terbuka

- Kode Roihan belum pernah dijalankan. Kontrak Hugo asli tidak dijalankan; yang diuji adalah kontrak turunannya (M6). Pembandingan langsung dengan `Hugo/` asli (mis. `npm run test:contracts` Hugo) belum dilakukan; angka Lampiran B direproduksi dari data dan rumusnya.
- Daftar `decideBatch` dan urutan fase telaah masih dijaga operator (batasan Ciko, arsitektur bagian 13). Gateway meneruskan apa adanya. Sejak M4 server menegakkan "Reveal setelah semua commit" dan "hanya yang reveal dihitung", tetapi kontrak tidak.
- Penelaah yang tidak commit atau reveal kini bisa ditangani admin (`close-phase`, M5), tetapi tenggat otomatis dan timeout refund menunggu M7. Penelaah yang tidak mengikat penugasan dan editor yang tidak merespons belum punya jalur pengganti.
- Tenggat otomatis untuk fase telaah yang macet (pengganti `close-phase` manual) dikerjakan di M7. Timeout dana di kontrak (M6) sudah ada, tetapi server belum menggerakkan sesi macet ke penutupan.
- Dua keputusan terbuka di "Temuan di lapangan (M4)": tautan pseudonim di server saat pengikatan, dan pembuatan pseudonim yang tak dibatasi undangan.
- `npm install` melaporkan kerentanan pada rantai dev; belum diperiksa (sama seperti M0).
- Frontend/zk-sim: CORS zk-sim belum diatur (M10). Kebijakan bobot jurnal tersimpan tetapi belum dikunci ke sesi (M7). Kontrak escrow ada (M6), tetapi server belum memakainya: `ESCROW_REQUIRED=false`, tidak ada setor/ikat/refund/distribusi dari server sampai M7. Refund pada Reject/desk reject kini mungkin di kontrak; penutupan sesi `Incomplete` dan sesi setelah refund menunggu M7.
- Tiga keputusan M6 sudah dijawab (terima kondisi sekarang), bukan lagi terbuka. Refund `Incomplete` tetap hanya lewat timeout; penutupan sesi `Incomplete` oleh server menunggu M7.
- Witness `REPUTATION_CLAIM` dan `REPUTATION_BUCKET` belum diperiksa zk-sim (M7); aturan pembulatan klaim reputasi belum diputuskan.
- Kompatibilitas pragma `^0.8.24` kontrak Roihan dengan solc 0.8.28 belum diuji (M8). Kontrak Hugo ditulis ulang dengan pragma `^0.8.28` dan dikompilasi di M6.
- M13 butuh RPC Sepolia, kunci deployer baru, dan ETH testnet dari pengguna.

## Cara menjalankan

```bash
cd integrated
npm install
npm run chain            # terminal 1, tetap hidup
npm run deploy:local     # terminal 2 (9 kontrak Ciko + verifier + gateway + EscrowPool, ReputationSBT, IncentiveEngine)
npm run check-wiring     # 83 pemeriksaan
npm run test:contracts

npm run storage          # M1: simulator storage di http://127.0.0.1:8081, tetap hidup
npm run test:storage     # tes M1
npm run demo:m1          # demo/regresi M1

npm run zk               # M2: zk-sim di http://127.0.0.1:8082, tetap hidup
npm run test:zk          # tes M2 (zk-sim)
npm run test:shared      # tes kripto klien
npm test                 # semua tes (kontrak, shared, storage-sim, zk-sim, server)
npm run demo:m2          # demo/regresi M2 (butuh chain + deploy:local; zk-sim nyala sendiri)

npm run server           # M3: server di http://127.0.0.1:3001 (Swagger /api); butuh chain, deploy, storage, zk
npm run test:server      # tes server
npm run demo:m3          # demo/regresi M3 (butuh chain + deploy:local; menyalakan storage, zk, server sendiri)
npm run demo:m4          # demo/regresi M4: P05-P08 jalur diterima sampai Published (prasyarat sama)
npm run demo:m5          # demo/regresi M5: revisi Minor/Major, zona abu-abu, desk reject/revisi desk, no-show (prasyarat sama)

npm run test:incentive   # M6: incentive-core (pipeline Hugo, model referensi bilangan bulat)
npm run demo:m6          # demo/regresi M6: escrow, refund, timeout, D1 = Lampiran B, klaim, decay (prasyarat sama; zk-sim nyala sendiri; memajukan jam chain > 180 hari)
```

Target akhir: `cd integrated && npm install && npm run demo`.
