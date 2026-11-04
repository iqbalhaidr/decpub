# Arsitektur Sistem Terintegrasi

**Status:** rancangan. Belum ada kode integrasi, dan kode ketiga proyek asal belum dijalankan. Semua rujukan berasal dari membaca kode dan laporan (lihat [`docs/analisis/`](analisis/)).

**Alias path**

| Alias | Path |
|---|---|
| `$CIKO` | `Ciko/Anonymize-Publication-main` |
| `$HUGO` | `Hugo/ojs-incentive-main` |
| `$ROIHAN` | `Roihan/Publication_System_DLT-main` |

## 1. Ringkasan

Sistem ini menyatukan tiga tugas akhir menjadi satu alur publikasi ilmiah yang bisa dicoba dari pra-pengajuan sampai pasca-publikasi.

| Sumber | Peran dalam integrasi | Yang diambil |
|---|---|---|
| Ciko (prioritas 1) | Tulang punggung alur | Mesin status 13 nilai, 9 kontrak, commit-reveal, pseudonim per sesi, server NestJS |
| Hugo (prioritas 2) | Mekanisme ekonomi | Escrow APC di muka, TOPSIS dan sigmoid on-chain, BWM + ECWM off-chain, QoS q1-q4, SBT reputasi |
| Roihan (prioritas 3) | Pelengkap | Frontend, katalog jurnal, editor per kategori, verifikasi bidang, plagiarisme, DOI NFT, komentar, open review, pola EIP-712 |

Tiga gagasan utama yang membuat ketiganya bisa disatukan:

1. **`ActionGateway`.** Satu kontrak baru menjadi satu-satunya session manager di kontrak Ciko. Tanda tangan pseudonim dan bukti ZK diperiksa di sana, sehingga 8 dari 9 kontrak Ciko tidak perlu diubah.
2. **Note pool untuk APC.** Penulis membayar dari dompet apa pun, dan pembayaran diikat ke sesi tanpa menyebut dompet atau note-nya.
3. **`reputationId` terpisah dari pseudonim.** Reputasi Hugo tetap terakumulasi lintas sesi, sedangkan transaksi mint tidak memuat pseudonim sesi.

## 2. Keputusan

Keputusan ini ditetapkan bersama pengguna pada 2026-11-04.

| ID | Topik | Keputusan |
|---|---|---|
| A1 | Reputasi q4 | SBT dikunci ke `reputationId = hash(secret)`. q4 berupa tingkat kasar dengan bukti ZK simulasi. Mint digabung per epoch |
| A2 | Setor APC | Note pool nominal tetap. Relayer mengikat note ke sesi lewat nullifier dan bukti ZK simulasi |
| A3 | Dana APC | Ditolak sebelum ada penelaah: refund penuh ke alamat baru. Setelah telaah: 100% untuk penelaah walau naskah ditolak, cair sekali saat keputusan final. Ada timeout refund |
| A4 | Kunci | Secret dan kunci pseudonim di browser. Pseudonim menandatangani EIP-712, relayer membayar gas. Server tepercaya untuk seleksi |
| B1 | Anonimisasi | Tetap seperti kode Ciko: metadata dan halaman sampul |
| B2 | Pengungkapan | Atas pilihan penulis. Desk reject dan gagal P03 tidak diungkap |
| B3 | Revisi | Ikuti kode Ciko: Minor ke `AssigningReviewers`, Major ke `UnderEditorialScreening`, tanpa mayoritas menjadi zona abu-abu. Hanya menambah endpoint yang hilang |
| C1 | Backend | Satu NestJS dan SQLite. Simulator storage dan ZK sebagai service kecil terpisah |
| C2 | Lingkup Roihan | Lihat bagian 7. Dibuang: `PublicationRegistry`, JRT, `ReviewOracle`, proses oracle, UUPS |
| C3 | Dompet dan demo | Dompet dev lokal, MetaMask hanya untuk setor APC di Sepolia. `npm run demo` satu perintah. Sepolia di milestone terakhir |

**Default turunan.** Tidak ditanyakan secara khusus dan disetujui bersama rencana.

| ID | Default | Alasan |
|---|---|---|
| D1 | Preset BWM dan λ ditetapkan per jurnal, dikunci saat sesi dibuat. Distribusi otomatis tanpa editor | Di Hugo editor memilih bobot sambil melihat alamat dan q4 penelaah (`$HUGO/server/index.ts:910`), yaitu jalur bias B06. P07 Ciko berjalan tanpa editor |
| D2 | 3 penelaah per batch, zona abu-abu menambah 2, maksimal 10 baris per sesi | Jalan tengah antara Ciko (min. 1), Hugo (min. 2, maks. 10), Roihan (ganjil, min. 3) |
| D3 | Baris matriks hanya pseudonim yang sudah reveal, dicek on-chain lewat `hasReveal` | Baris no-show Hugo `[30,0,0,q4]` (`$HUGO/server/index.ts:682`) mengubah skor peserta lain. Mask `participated` dari operator jadi tidak perlu |
| D4 | QoS simulasi = `HeuristicProvider` Hugo ditambah penanda bahasa Indonesia, deterministik | Sudah memenuhi antarmuka tanpa LLM, tetapi regex-nya hanya bahasa Inggris |
| D5 | Fungsi sigmoid on-chain Hugo dipertahankan, pratinjau off-chain disamakan | Mengganti ke logistik fixed-point menambah gas dan risiko. Selisihnya didokumentasikan (bagian 14) |
| D6 | APC 0,01 ETH | Nilai contoh Hugo (`$HUGO/frontend/author.ts:40`), cukup murah untuk Sepolia |

**Penyesuaian akibat B1 dan B3**

- **A3 berubah sedikit.** Rata-rata q antar putaran tidak diperlukan. Satu pseudonim hanya bisa commit sekali (`$CIKO/contracts/contracts/ReviewSubmissions.sol:99`), sehingga tiap putaran memakai pseudonim baru dan tiap pseudonim menjadi satu baris matriks.
- **"Penelaah yang sama" pada revisi minor berlaku di tingkat orang.** Server mengundang orang yang sama dengan pseudonim baru.
- **Revisi tetap menghasilkan naskah anonim.** `recordRevision` mewajibkan hash anonim baru (`$CIKO/contracts/contracts/PublicationSessions.sol:128`). Hanya status P03-P04 on-chain yang dilewati, bukan fungsi anonimisasinya.
- **Hash anonim dicatat saat P02, mengikuti kode** (`PublicationSessions.sol:50`). CID bersifat content-addressed, jadi bisa dihitung di P02 sementara berkasnya baru diunggah ke storage publik di P04.
- **`Incomplete` hanya bisa diperiksa ulang dengan berkas yang sama,** karena tidak ada fungsi memperbarui hash. Bila berkas berubah, sesi ditutup, APC di-refund, dan penulis mengajukan sesi baru.
- **Konsekuensi B1.** `generateSamplePdf` Ciko menulis nama, afiliasi, dan surel di isi halaman (`$CIKO/server/src/manuscripts/utils/sample-generator.util.ts:39-45`), dan anonimisasi tidak menyentuh isi (`manuscripts-anonymization.service.ts:28-42`). Kode anonimisasi tidak diubah, tetapi sampel demo dibuat tanpa identitas di isi, dan `identityExposed` ditampilkan sebagai peringatan tanpa mengubah hasil.

## 3. Komponen

```text
Browser (Next.js polos)                       Storage Sim :8081
  secret + kunci pseudonim di browser           POST /api/v0/add, GET /ipfs/:cid
  EIP-712, commit hash dihitung klien           halaman HTML: unggah, cari, unduh
     | REST + JWT         | witness                  ^
     v                    v                          |
Server NestJS :3001 --> ZK Sim :8082                 |
  auth, jurnal, seleksi,  bukti = tanda tangan       |
  alur P01-P08, QoS,      attestor                   |
  insentif, private store ---------------------------+
  SQLite                  (naskah asli terenkripsi hanya di private store)
     | operator (relayer, membayar gas)
     v
ActionGateway --verifikasi EIP-712 dan IZkVerifier--> SimulatedZkVerifier
     |
     +--> 9 kontrak Ciko        (mesin status, commit-reveal, keputusan)
     +--> EscrowPool, IncentiveEngine, ReputationSBT   (Hugo)
     +--> DOIToken (Roihan), PublicationRecords (baru)
Hardhat node :8545, atau Sepolia lewat env
```

| Komponen | Port | Asal | Tugas |
|---|---|---|---|
| `frontend` | 3000 | Roihan | Halaman per peran, menyimpan secret, menandatangani aksi |
| `server` | 3001 | Ciko, ditambah port fitur Go Roihan dan modul Hugo | API, orkestrasi P01-P08, relayer |
| `services/storage-sim` | 8081 | Baru | Simulator IPFS dengan halaman HTML sederhana |
| `services/zk-sim` | 8082 | Baru | Memeriksa witness dan menerbitkan bukti simulasi |
| `contracts` | 8545 (node) | Ketiganya | Sumber kebenaran status, dana, dan reputasi |
| SQLite | - | Baru | Akun, jurnal, antrian verifikasi, undangan, komentar, snapshot insentif |

**Model kepercayaan.** Server tepercaya untuk seleksi dan mengetahui pemetaan undangan ke orang, sesuai model laporan Ciko (Lap. hlm. 95). Server tidak memegang secret, tidak melihat rekomendasi sebelum reveal, dan tidak bisa memalsukan aksi bertanda tangan. Semua pihak lain hanya melihat apa yang tercantum di matriks visibilitas (bagian 8).

## 4. Diagram alur

### Alur end-to-end

```text
PENULIS                    SISTEM                         EDITOR / PENELAAH        ON-CHAIN
-------                    ------                         -----------------        --------
P01 daftar, buat secret -> terbitkan kredensial                                    adminRegister
    beli note APC ----------------------------------------------------------------> deposit
P02 unggah + identitas --> simpan asli (terenkripsi)
                           hitung hash dan CID anonim
    buat pseudonim, tanda tangan --------------------------------------------------> createEphemeralWithProof
                                                                                     createSessionSigned
                                                                                     bindNote
P03                        cek otomatis + plagiarisme                                recordAutomaticCheck
                           gagal: selesai, refund                                    refund
P04                        unggah anonim, cek CID                                    updateStatus(5)
P05                        pilih editor per kategori ---> undangan, buat pseudonim   assignEditor
                                                          baca PDF anonim            recordEditorAssignmentProof
                                                          putusan + kriteria ------> screeningSigned
                           desk reject: selesai, refund                              refund
P06                        pilih penelaah per bidang ---> undangan                   recordSelectionBatch
                                                          terima, buat pseudonim     createEphemeralWithProof
                                                          bukti tingkat q4
                           semua menerima                                            updateStatus(9)
P07                                                       baca PDF anonim
                                                          commit dari klien -------> commitReviewSigned
                           semua commit: buka Reveal                                 setReviewPhase
                                                          reveal + unggah laporan -> revealReviewSigned
Keputusan                  agregasi                                                  decideBatch
    revisi <-------------- Minor/Major                                               recordRevisionSigned
                           zona abu-abu: kembali ke P06
                           final: QoS, bobot, distribusi                             executeDistribution
P08 pilih mengungkap ----> buka asli, cek hash                                       updateStatus(12), DOIToken.mint
                                                                                     recordFinal, recordDisclosure
                                                          klaim imbalan -----------> claimReward
                                                          klaim reputasi ----------> claimReputation (per epoch)
PEMBACA                    artikel, open review, komentar                            postComment
```

### Mesin status

Tidak berubah dari kode Ciko (`$CIKO/contracts/contracts/PublicationSessions.sol:224-264`).

```text
Submitted -> UnderAutomaticChecking -> Incomplete -> (cek ulang)
                 | Pass                    | Reject -> Rejected [refund]
                 v
          UnderAnonymization -> UnderEditorialScreening <---------------+
                                  | Proceed   | Revise -> MajorRequired-+ recordRevision
                                  |           | DeskReject -> Rejected [refund]
                                  v
                      AssigningReviewers <-- MinorRequired (recordRevision)
                                  | updateStatus(9), endpoint baru   ^
                                  v                                  | zona abu-abu
                              UnderReview --decideBatch-------------+
                                  | Accept -> Accepted -> Published
                                  | Reject -> Rejected [penelaah tetap dibayar]
                                  | Minor/Major -> *RevisionRequired
```

## 5. Pemetaan tahap ke komponen

Kode tahap memakai penomoran Ciko. Keputusan akhir adalah bagian dari P07 di dokumen Ciko, tetapi dipisah di sini sesuai sembilan tahap permintaan.

### 5.1 Pra-pengajuan (P01)

| Aspek | Isi |
|---|---|
| Aktor dan akun | Semua anggota, akun permanen |
| Kontrak | `PermanentAccounts.adminRegister`, `EscrowPool.deposit` |
| Server | `auth`, `users`, `journals`, `verification` (terbitkan kredensial peran dan bidang) |
| Halaman | `/register`, `/login`, `/profile`, `/journals`, `/author/apc` |
| Hugo | Beli note APC bernominal tetap |
| Roihan | Akun email dan password, katalog jurnal dan kategori, kebijakan bobot per jurnal |
| Tetap rahasia | `identitySecret` terhadap semua pihak termasuk server |

### 5.2 Pengajuan manuskrip (P02)

| Aspek | Isi |
|---|---|
| Aktor dan akun | Penulis, pseudonim Author per sesi |
| Kontrak | `ActionGateway.createEphemeralWithProof(Author)`, `createSessionSigned`, `EscrowPool.bindNote` |
| Server | `POST /manuscripts/intake`, `POST /flows/ephemeral-account`, `POST /flows/submission`, `POST /escrow/bind` |
| Halaman | `/author/submit` |
| Hugo | Ikat escrow ke sesi. Note dan dompet tidak muncul di transaksi ini |
| Tetap rahasia | Naskah asli dan identitas hanya di private store terenkripsi. Hash metadata diberi salt agar tidak bisa ditebak dari nama dan surel |
| Perubahan dari kode asal | Pseudonim dibuat klien dengan bukti. `metadataHash` diberi salt. `GET /manuscripts/:id/manifest` (`manuscripts.controller.ts:48-63`) yang membuka nama tanpa autentikasi dibatasi untuk pemilik |

### 5.3 Pengecekan (P03)

| Aspek | Isi |
|---|---|
| Aktor dan akun | Sistem |
| Kontrak | `AutomaticChecks.recordAutomaticCheck` |
| Server | `manuscripts-automatic-check.service.ts`, `plagiarism`. Laporan diunggah ke storage publik |
| Halaman | `/tracker/[id]`, `/author/sessions/[id]` |
| Hugo | Refund bila hasil `Reject` |
| Roihan | Plagiarisme simulasi, ambang 30 dari `PublicationRegistry.sol:131` |
| Perubahan dari kode asal | `result` dihitung server, bukan dari klien (`flows.dto.ts:99-101`). `identityExposed` tampil sebagai peringatan |

### 5.4 Penghapusan identitas (P04)

| Aspek | Isi |
|---|---|
| Aktor dan akun | Sistem |
| Kontrak | `updateStatus(5)` lewat gateway |
| Server | `manuscripts-anonymization.service.ts` apa adanya (B1). Berkas diunggah ke storage dan CID-nya dicocokkan dengan on-chain |
| Halaman | `/author/sessions/[id]`, `/tracker/[id]` |
| Batasan | Hanya metadata dan sampul. Identitas di isi PDF tetap terbaca |

### 5.5 Penyaringan editorial (P05)

| Aspek | Isi |
|---|---|
| Aktor dan akun | Editor, pseudonim Editor per sesi |
| Kontrak | `assignEditor`, `recordEditorAssignmentProof`, `screeningSigned`, `recordReviewerCriteria` |
| Server | `selection` (editor acak sesuai kategori), `POST /flows/editorial-screening` |
| Halaman | `/editor` |
| Hugo | Refund bila desk reject dan belum ada telaah |
| Roihan | Pencocokan kategori (`$ROIHAN/backend-go/internal/repository/verification.go:285-298`) |
| Tetap rahasia | Identitas penulis terhadap editor, identitas editor terhadap penulis dan penelaah |

### 5.6 Pemilihan penelaah (P06)

| Aspek | Isi |
|---|---|
| Aktor dan akun | Sistem memilih, penelaah menerima dengan pseudonim Reviewer baru |
| Kontrak | `recordSelectionBatch`, `batchRecordReviewerAssignmentProofs`, `createEphemeralWithProof(Reviewer)`, `updateStatus(9)` |
| Server | `selection` (acak per bidang terverifikasi, mengecualikan penulis naskah), undangan simulasi. Endpoint baru untuk status 9, yang di Ciko tidak ada |
| Halaman | `/reviewer/assignments`, `/reviewer/specialization` |
| Hugo | Penelaah baru masuk alur setelah tahap ini. Bukti tingkat q4 dibuat saat menerima undangan |
| Roihan | Bidang terverifikasi sebagai sumber kandidat |
| Tetap rahasia | Daftar penelaah terhadap editor dan penulis |

### 5.7 Proses telaah (P07)

| Aspek | Isi |
|---|---|
| Aktor dan akun | Penelaah, pseudonim Reviewer |
| Kontrak | `setReviewPhase`, `commitReviewSigned`, `revealReviewSigned` |
| Server | `/flows/reviews/*`. Reveal dibuka setelah semua commit, karena kontrak tidak menegakkannya (`ReviewSubmissions.sol:52-71`) |
| Halaman | `/review/[sessionId]` (dua langkah, 4 rekomendasi) |
| Hugo | QoS baru dihitung setelah reveal, agar teks telaah tidak diproses lebih awal (B07) |
| Perubahan dari kode asal | `commitHash` dihitung klien, sehingga server tidak melihat rekomendasi saat commit (`flows.service.ts:298-331`) |

### 5.8 Keputusan akhir (P07 lanjutan)

| Aspek | Isi |
|---|---|
| Aktor dan akun | Sistem, tanpa editor |
| Kontrak | `decideBatch`, `recordRevisionSigned`, `IncentiveEngine.executeDistribution` |
| Server | `flows`, `incentive`. Endpoint baru untuk revisi, yang di Ciko tidak ada |
| Halaman | `/tracker/[id]`, `/incentive/[id]`, `/author/revise` |
| Hugo | Saat status final: TOPSIS, sigmoid, kredit imbalan per pseudonim |
| Aturan (B3) | Mayoritas absolut menentukan hasil. Semua kasus tanpa mayoritas menjadi zona abu-abu (`ReviewDecisions.sol:207-214`), lalu batch baru dan agregasi ulang atas seluruh pseudonim. `Minor` ke `AssigningReviewers`, `Major` ke `UnderEditorialScreening` dengan editor yang sama |

### 5.9 Pasca publikasi (P08)

| Aspek | Isi |
|---|---|
| Aktor dan akun | Sistem, penulis, penelaah, pembaca |
| Kontrak | `updateStatus(12)`, `DOIToken.mint`, `PublicationRecords.recordFinal`, `recordDisclosure`, `EscrowPool.claimReward`, `ReputationSBT.claimReputation`, `DOIToken.postComment` |
| Server | `flows`, `comments`, epoch reputasi, kontribusi agregat |
| Halaman | `/articles`, `/articles/[id]`, `/author/disclose`, `/reviewer/earnings` |
| Hugo | Klaim imbalan ke alamat baru, mint SBT per epoch |
| Roihan | DOI NFT, komentar pembaca, panel open review |
| Aturan (B2) | Saat `Published` artikel tampil dalam versi anonim. Naskah asli dan nama baru dibuka bila penulis melakukan selective disclosure, dan hash-nya harus sama dengan `originalManuscriptHash`. Penelaah tidak pernah diungkap, editor opsional |

## 6. Posisi mekanisme Hugo

### 6.1 Escrow pool

`createBatch` Hugo memuat penulis, penelaah, dan jurnal dalam satu transaksi (`$HUGO/contracts/IncentiveEngine.sol:72-84`). Karena itu escrow dipisah menjadi `EscrowPool`.

```text
P01  dompet penulis --deposit(noteCommitment), APC tetap--> EscrowPool (belum terikat)
P02  relayer: bindNote(sessionId, nullifier, bukti)          note tidak muncul di tx ini
P03/P05 ditolak, belum ada batch penelaah: refund(.., alamatBaru, bukti)
P07  ada keputusan dan status final (Accepted/Rejected):
       executeDistribution -> TOPSIS + sigmoid -> claimable[pseudonym]
       tidak ada yang reveal: pilih penelaah baru, bila habis timeout refund
P08  claimReward(pseudonym, alamatBaru, EIP-712)   imbalan ETH
```

**Aturan dana**

| Kejadian | Kondisi on-chain | Dana |
|---|---|---|
| Gagal P03 atau desk reject tanpa telaah | `Rejected`, `getLatestBatch == 0` | Refund penuh ke alamat baru |
| Tidak ada reveal dan penelaah pengganti habis | Belum ada keputusan, melewati timeout | Refund penuh |
| Sesi macet tanpa keputusan | Belum ada keputusan, melewati timeout | Refund penuh |
| Diterima | `Accepted`, ada keputusan | 100% ke penelaah yang reveal |
| Ditolak setelah telaah | `Rejected`, ada keputusan | 100% ke penelaah yang reveal |
| Desk reject setelah pernah ditelaah (jalur Major) | `Rejected`, ada keputusan | 100% ke penelaah yang reveal |
| Revisi tidak pernah dikirim | `*RevisionRequired`, melewati timeout | 100% ke penelaah yang reveal |

Timeout menjadi parameter konstruktor dengan default 90 hari. Demo lokal memajukan waktu dengan `evm_increaseTime`.

**Masalah Hugo yang ikut ditutup:** dana terkunci bila operator tidak mengeksekusi, satu alamat penerima bisa memblokir batch karena kirim langsung dalam loop (`IncentiveEngine.sol:155-156`), sisa pembulatan tertahan (kini masuk ke skor tertinggi), `batchId` dihitung klien (kini `sessionId`), dan `receive()` tanpa jalur penarikan (dibuang).

### 6.2 Insentif hibrida adaptif

Rumus dan parameter mengikuti kode Hugo, rinciannya di [`analisis/hugo.md`](analisis/hugo.md) bagian 6.

```text
matriks mentah [q1,q2,q3,q4] per pseudonim yang reveal
  -> normalisasi min-max (q1 cost, sisanya benefit)
  -> Wsub dari BWM, preset kebijakan jurnal
  -> Wobj dari ECWM = γ·Entropy + (1-γ)·CRITIC, γ = 0,5    bagian adaptif
  -> W = λ·Wsub + (1-λ)·Wobj, λ = 0,6 dari kebijakan jurnal
  -> skala 1e18, unggah laporan QoS ke storage, hash masuk transaksi
ON-CHAIN executeDistribution:
  S_i     = TOPSIS(matriks, W)
  sigma_i = _sigmoid(S_i), k = 10, x0 = 0,5
  ETH_i   = escrow * sigma_i / sum(sigma)
```

| Bagian | Tempat | Berkas sumber |
|---|---|---|
| Normalisasi, BWM, ECWM, fusi | Off-chain, `packages/incentive-core` | `$HUGO/middleware/normalization.ts`, `middleware/weighting/*.ts` |
| TOPSIS, sigmoid, pembagian | On-chain, `IncentiveEngine` | `$HUGO/contracts/IncentiveEngine.sol:190-295` |
| Pratinjau off-chain | `packages/incentive-core` | `$HUGO/middleware/topsis.ts`. Sigmoid ditambah varian yang sama dengan on-chain |
| Preset BWM | Satu sumber | `$HUGO/frontend/config/eval-datasets.ts:35-39`, karena server Hugo memakai vektor lain |

### 6.3 QoS

| Kriteria | Sumber | Status | Catatan |
|---|---|---|---|
| q1 kecepatan | `committedAt` (`ReviewSubmissions.sol:109`) dikurangi `recordedAt` batch (`ReviewerSelections.sol:71`) | REAL | Menggantikan `daysElapsed` dari klien Hugo. Lokal dimajukan `evm_increaseTime` agar selisihnya bermakna |
| q2 relevansi | `QoSProvider.relevance(teks reveal, abstrak anonim)` | SIMULASI | Kosinus frekuensi kata, tanpa LLM |
| q3 actionability | `QoSProvider.actionability(teks reveal)` | SIMULASI | Proporsi kalimat dengan penanda saran, ditambah penanda bahasa Indonesia. Tanpa itu, enam contoh ulasan Indonesia di `$HUGO/frontend/reviewer.ts:58-65` mendapat q3 = 0 |
| q4 reputasi | Tingkat dari `effectiveBalance(reputationId)` | Saldo REAL, bukti SIMULASI | Tingkat 0, 0,25, 0,5, 0,75, 1 |

### 6.4 Reputasi SBT

Pseudonim baru tiap sesi membuat q4 selalu 0 bila kode Hugo dipakai apa adanya, dan mint ke alamat permanen menautkan penelaah ke naskah. Rancangannya:

1. `reputationId = hash(secret, "rep")`, disimpan di browser. Di `ReputationSBT`, kuncinya `bytes32`, bukan `address`.
2. Saat menerima undangan, penelaah membuat bukti `REPUTATION_BUCKET` untuk pseudonim barunya. Server hanya menerima tingkatnya.
3. Setelah sesi selesai, penelaah membuat bukti `REPUTATION_CLAIM` tanpa menyebut pseudonim. Nilainya dibulatkan ke kelipatan 0,25 agar tidak menjadi sidik jari.
4. Relayer menggabungkan klaim per epoch ke satu transaksi mint, sehingga waktu dan isi mint tidak tertaut ke sesi.

Decay 2% per hari dari Hugo dipertahankan. `triggerDecay` diperbaiki karena saat ini memanggilnya berulang bisa menghindari decay (`$HUGO/contracts/ReputationSBT.sol:81,109,111`).

## 7. Komplemen Roihan

**Dipakai**

| Fitur | Tahap | Implementasi |
|---|---|---|
| Frontend per peran | Semua | Disalin lalu dipolos (bagian 12) |
| Akun email/password, JWT, peran | P01 | Port `usecase/auth.go`, `middleware/jwt.go`, `middleware/role.go`. Terpisah total dari pseudonim |
| Katalog jurnal dan kategori | P01, P02, P05 | Port `013_journals.up.sql`, ditambah kolom kebijakan bobot |
| Pencocokan editor per kategori | P05 | Port `verification.go:285-298`, dengan pilihan acak |
| Verifikasi bidang penelaah | P01, P06 | Port `verification.go:58-183`. Disetujui admin, bukan editor, agar editor tidak melihat surel kandidat |
| Plagiarisme | P03 | `PlagiarismProvider` simulasi. Bukan mock `oracle/src/plagiarism.js` (lihat bagian 14) |
| DOI NFT | P08 | `DOIToken.sol` disalin, `DOILib` diekstrak dari `PublicationRegistry.sol:26-68` |
| Komentar pembaca | P08 | Port `repository/comment.go`, `Comments.tsx`. Tanpa menampilkan surel |
| Panel open review | P08 | `OpenReviewPanel.tsx`, memenuhi laporan anonim F20 Ciko |
| Pola EIP-712 | P02-P08 | Pola `PublicationRegistry.sol:214-223`, dengan domain chain dari env |
| Pembaca log berjendela | P08 | Rujukan `chainquery/logs.go:36-130` untuk audit trail |

**Dibuang**

| Fitur | Alasan |
|---|---|
| `PublicationRegistry` | Bertumpuk dengan `PublicationSessions`, dan menyimpan judul, abstrak, CID asli on-chain |
| `JournalToken` (JRT) | Digantikan ETH escrow. Sisa biaya JRT juga terkunci selamanya |
| `ReviewOracle` dan proses oracle | Server sudah menjadi pengorkestrasi, jadi oracle hanya menambah satu titik macet |
| UUPS | Kontrak Ciko memakai referensi `immutable`, dan demo cukup deploy ulang |
| Backend Go dan PostgreSQL | Keputusan C1, menjadi rujukan port |
| `session_wallet.go`, kunci privat di DB | Bertentangan langsung dengan A4 |
| Pendanaan dompet sesi dari dompet utama | Menaut identitas, apalagi bila terjadi sebelum telaah |

## 8. Anonimitas dan simulasi ZK

### 8.1 ActionGateway

Server menjadi operator gateway dan tidak punya hak session manager di kontrak Ciko, sehingga tidak bisa melewati pemeriksaan.

| Jenis aksi | Fungsi | Pemeriksaan |
|---|---|---|
| Bertanda tangan pseudonim (EIP-712) | `createSessionSigned`, `recordRevisionSigned`, `screeningSigned`, `commitReviewSigned`, `revealReviewSigned` | Tanda tangan, nonce per pseudonim, ikatan commitment penugasan ke pseudonim |
| Ber-ZK | `createEphemeralWithProof` | `IZkVerifier`, nullifier belum dipakai |
| Sistem | `updateStatus`, `assignEditor`, `recordAutomaticCheck`, `recordSelectionBatch`, bukti penugasan, `setReviewPhase`, `decideBatch`, `recordReviewerCriteria` | Hanya operator |

Ikatan commitment ke pseudonim menutup celah Ciko: satu `assignmentCommitment` saat ini tidak terikat ke satu pseudonim (`ReviewSubmissions.sol:97`).

### 8.2 Operasi ZK simulasi

Bukti berbentuk `{scheme: "simulated", kind, publicSignals, proof}`. `proof` adalah tanda tangan attestor atas domain, chain, verifier, jenis, dan sinyal publik. Attestor benar-benar memeriksa witness sebelum menandatangani, dan witness tidak pernah disimpan atau dicatat di log. `SimulatedZkVerifier` memverifikasinya on-chain dengan `ecrecover`.

| Jenis | Tahap | Witness | Sinyal publik | Yang diperiksa |
|---|---|---|---|---|
| `EPHEMERAL` | P02, P05, P06 | secret, kredensial, salt | sesi, peran, pseudonim, `sessionCommitment`, nullifier | Commitment terdaftar di `PermanentAccounts`, kredensial sah untuk peran, satu per sesi per peran per batch |
| `ASSIGNMENT` | P05, P06 | hasil seleksi dari server | sesi, `criteriaHash`, commitment | Kandidat memenuhi kriteria |
| `ASSIGNMENT_OWNERSHIP` | P06 | salt undangan | sesi, commitment, pseudonim | Pemegang undangan pemilik pseudonim |
| `NOTE_BIND` | P02 | rahasia note | sesi, nullifier | Note ada, belum dipakai |
| `NOTE_REFUND` | P03, P05, timeout | rahasia note | sesi, penerima, nullifier | Pemilik note yang sama, penerima terikat |
| `REPUTATION_BUCKET` | P06 | secret | sesi, pseudonim, tingkat, nullifier | Saldo setelah decay berada di tingkat itu |
| `REPUTATION_CLAIM` | P08 | secret, pseudonim | `reputationId`, tingkat, nullifier | Pemilik pseudonim dengan imbalan terkredit, belum diklaim |
| `SELECTIVE_DISCLOSURE` | P08 | secret, salt | sesi, pseudonim, akun permanen, hash atribut | Akun permanen pemilik pseudonim, hanya atribut terpilih yang dibuka |

**Perubahan yang dituntut:** `createEphemeral` tidak lagi menerima commitment permanen. Kode Ciko saat ini membuat pseudonim bisa ditautkan dari data publik (`IPermanentAccounts.sol:11-15`, `IEphemeralAccounts.sol:20-26`), dan satu akun hanya bisa punya satu pseudonim seumur sistem (`EphemeralAccounts.sol:53-55,72`).

### 8.3 Matriks visibilitas

| Data | Penulis | Editor | Penelaah | Publik | Server |
|---|---|---|---|---|---|
| Identitas penulis | Ya | Tidak | Tidak | Hanya setelah disclosure | Ya (tepercaya) |
| Identitas editor | Tidak | Ya | Tidak | Opsional saat terbit | Ya |
| Identitas penelaah | Tidak | Tidak | Hanya diri sendiri | Tidak pernah | Ya, untuk undangan |
| Rekomendasi sebelum reveal | Tidak | Tidak | Hanya miliknya | Tidak | Tidak, karena commit dihitung klien |
| Secret dan kunci pseudonim | Miliknya | Miliknya | Miliknya | Tidak | Tidak |
| Naskah asli | Ya | Tidak | Tidak | Setelah disclosure | Terenkripsi di private store |
| Naskah anonim | Ya | Ya | Ya | Ya, sejak P04 | Ya |
| Skor q per pseudonim | Ya | Ya | Ya | Ya | Ya |

### 8.4 Jalur kebocoran dan mitigasi

| Jalur | Mitigasi | Sisa risiko |
|---|---|---|
| Deposit APC dari dompet asli | Nominal tetap, note tidak muncul saat bind | Korelasi waktu. UI menyarankan membeli note jauh sebelum mengajukan |
| Refund ke penyetor | Refund ke alamat baru lewat bukti | Tidak ada, selama alamat baru benar-benar baru |
| Imbalan ke alamat penelaah | Pola klaim ke alamat baru, ditandatangani pseudonim | Nominal imbalan unik |
| Mint SBT | Tanpa pseudonim, per epoch, dibulatkan | `reputationId` menaut aktivitas antar-epoch, tetapi tidak ke nama |
| q4 di calldata | Tingkat kasar | Pencocokan kasar dengan saldo SBT publik |
| Teks ulasan di calldata (Roihan) | Hanya hash di on-chain, laporan di storage setelah reveal | Tidak ada |
| Isi PDF | Tidak ditangani (B1) | Nama di isi tetap terbaca, begitu juga gaya tulisan dan sitasi |

## 9. Perubahan kontrak

| Kontrak | Asal | Tindakan |
|---|---|---|
| `PermanentAccounts`, `PublicationSessions`, `AutomaticChecks`, `EditorialScreenings`, `AssignmentProofs`, `ReviewerSelections`, `ReviewSubmissions`, `ReviewDecisions` | Ciko | Salin tanpa perubahan |
| `EphemeralAccounts` | Ciko | Hapus cek commitment permanen dan keunikan global (`:53-55,72`). Field menjadi `sessionCommitment` |
| `ActionGateway` | Baru, pola EIP-712 Roihan | Bagian 8.1, ditambah `setVerifier` |
| `IZkVerifier`, `SimulatedZkVerifier` | Baru | `verify(kind, publicSignals, proof)`, implementasi `ecrecover` attestor |
| `EscrowPool` | Dipecah dari `IncentiveEngine` Hugo | `deposit`, `bindNote`, `refund`, kredit, `claimReward` |
| `IncentiveEngine` | Hugo | Pertahankan `_topsis`, `_sigmoid`, `_sqrt`. Berbasis `sessionId`, validasi jumlah bobot dan rentang matriks, cek `hasReveal`, simpan hash laporan QoS dan kebijakan |
| `ReputationSBT` | Hugo | Kunci `bytes32`, mint per tingkat dengan nullifier, perbaiki `triggerDecay` |
| `DOIToken`, `DOILib` | Roihan | Salin, ekstrak library |
| `PublicationRecords` | Baru | Rujukan final, DOI, dan disclosure, tanpa mengubah `PublicationSessions` |

**Tooling:** Hardhat 3, viem, Ignition, Solidity 0.8.28 dari Ciko. Kontrak Hugo dan Roihan ber-pragma `^0.8.24`, jadi seharusnya bisa dikompilasi dengan versi itu, tetapi belum diuji.

**Wiring:** modul Ignition Ciko tidak memberi izin apa pun (`FullSystem.ts:7-30`), sehingga panggilan server akan gagal `OnlySessionManager` setelah deploy baru. Modul baru menambahkannya dengan `m.call`, mengikuti urutan `$CIKO/contracts/test/FullFlow.test.ts:147-180`.

**Jangan disalin:** `$CIKO/contracts/ignition/parameters.json` (berisi 3 kunci privat teks jelas), `$HUGO/deployments/*`, dan wallet seed Roihan di `008_seed_reviewers.up.sql`.

## 10. Struktur folder

```text
integrated/
  package.json            npm workspaces, `npm run demo`
  .env.example
  README.md
  contracts/              Hardhat 3
    contracts/
      ciko/               9 kontrak + interfaces
      hugo/               EscrowPool, IncentiveEngine, ReputationSBT
      roihan/             DOIToken, DOILib
      zk/                 IZkVerifier, SimulatedZkVerifier
      gateway/            ActionGateway, PublicationRecords
    ignition/modules/Integrated.ts
    test/
  packages/
    shared/               ABI, status, tipe EIP-712, kripto klien, StorageProvider, ZkProver
    incentive-core/       salinan middleware Hugo + QoS simulasi
  services/
    storage-sim/          simulator IPFS + halaman HTML
    zk-sim/               attestor
  server/src/             NestJS (dari Ciko)
    blockchain contracts flows manuscripts query public      (Ciko)
    auth users journals verification comments                (port dari Go Roihan)
    selection escrow incentive qos plagiarism storage zk     (baru)
  frontend/               Next.js (dari Roihan), polos
  scripts/
    demo.ts               satu perintah
    scenarios/            S1-S6
    milestones/           demo:mN
    audit-anonymity.ts
```

## 11. REAL vs SIMULASI

| Komponen | Status | Sekarang | Interface pengganti | Cara mengganti |
|---|---|---|---|---|
| Mesin status, commit-reveal, keputusan | REAL | Kontrak Ciko | - | - |
| Tanda tangan pseudonim | REAL | EIP-712, chainId dari env | - | - |
| Escrow ETH, TOPSIS, sigmoid, SBT | REAL | Kontrak | - | - |
| BWM, ECWM, fusi, normalisasi | REAL (off-chain) | Kode Hugo | - | - |
| q1 | REAL | Timestamp on-chain. Lokal dimajukan `evm_increaseTime` | - | - |
| Storage publik (IPFS) | SIMULASI | `storage-sim`, CIDv1 sha-256 | `StorageProvider`, subset API Kubo | Arahkan `STORAGE_API_URL` dan `STORAGE_GATEWAY_URL` ke node Kubo |
| Storage privat | SIMULASI | Berkas AES-256-GCM | `PrivateStore` | Ganti implementasi |
| ZK | SIMULASI | Attestor memeriksa witness lalu menandatangani | `ZkProver.prove`, `IZkVerifier.verify` | Prover snarkjs di browser, `ActionGateway.setVerifier` |
| QoS q2/q3 | SIMULASI | Heuristik | `QoSProvider` | `LocalModelProvider` Hugo, `QOS_PROVIDER=local` |
| Tingkat q4 | Saldo REAL, bukti SIMULASI | `effectiveBalance` dan ZK Sim | `proveReputationBucket` | Sirkuit nyata |
| Plagiarisme | SIMULASI | Tumpang tindih n-gram terhadap korpus | `PlagiarismProvider` | API eksternal |
| Undangan stealth | SIMULASI | `inviteRef` hash dan inbox server | `InviteChannel` | Stealth address nyata |
| Anonimisasi | REAL, terbatas (B1) | Metadata dan sampul | Layanan anonimisasi | Ganti implementasi layanan |
| DOI | SIMULASI | Format Roihan, tidak terdaftar | `DOILib` | Registrar nyata |
| Jaringan | Lokal, lalu Sepolia | Hardhat node | `NETWORK`, `RPC_URL`, `CHAIN_ID` | Ignition `--network sepolia` |
| Dompet | Dev / MetaMask | Akun Hardhat | `WalletProvider` | Env |

Setiap simulasi diberi label teks `[SIMULASI]` di UI dan menolak kasus negatif (bukan anggota, peran salah, sesi salah, nullifier dipakai ulang, artefak diubah), supaya alurnya tetap bermakna.

### Bentuk interface

```ts
// Storage publik. Subset API Kubo: POST /api/v0/add, GET /ipfs/:cid.
interface StorageProvider {
  cidOf(bytes: Uint8Array): Promise<string>;   // Kubo: add?only-hash=true
  put(bytes: Uint8Array, filename: string): Promise<{ cid: string; size: number }>;
  get(cid: string): Promise<Uint8Array>;
  stat(cid: string): Promise<{ size: number } | null>;
}

interface PrivateStore {
  put(ref: string, bytes: Uint8Array): Promise<void>;
  get(ref: string): Promise<Uint8Array>;
}

// Berjalan di klien pada implementasi nyata.
interface ZkProver {
  prove(kind: ZkKind, witness: unknown, publicSignals: Hex[]): Promise<ZkProof>;
}
type ZkProof = { scheme: "simulated" | string; kind: ZkKind; publicSignals: Hex[]; proof: Hex };

// Dari $HUGO/middleware/qos/types.ts:25-32, tidak berubah.
interface QoSProvider {
  readonly name: string;
  relevance(reviewText: string, paperText: string): Promise<number>; // [0,1]
  actionability(reviewText: string): Promise<number>;                // [0,1]
}

interface PlagiarismProvider { score(text: string): Promise<number> }  // 0-100
interface InviteChannel {
  send(userRef: string, invite: Invite): Promise<void>;
  inbox(userRef: string): Promise<Invite[]>;
}
interface WalletProvider {
  address(): Promise<Hex>;
  deposit(noteCommitment: Hex, value: bigint): Promise<Hex>;
}
```

```solidity
interface IZkVerifier {
    function verify(uint8 kind, bytes32[] calldata publicSignals, bytes calldata proof)
        external view returns (bool);
}
```

**Catatan CID.** CIDv1 raw sha-256 sama dengan Kubo hanya untuk berkas sebesar satu chunk (`--cid-version=1 --raw-leaves`, 256 KiB bawaan). Berkas lebih besar akan berbeda karena Kubo memecahnya menjadi DAG. Kode memperlakukan CID sebagai nilai opaque dan selalu menghitungnya lewat `cidOf`, jadi penggantian tetap hanya mengubah env.

## 12. Frontend

### Pilihan dasar

**Roihan.** Tebakan pengguna benar: 18 route, 5.483 baris, alur per peran, revisi, komentar, riwayat, dan CI, sementara Ciko tidak punya frontend (hanya Swagger) dan Hugo berupa 10 halaman HTML yang lebih sederhana. Biayanya ada pada strip-down dan penulisan ulang logika, karena antarmuka Roihan hanya mengenal alurnya sendiri. Halaman Hugo `pipeline` dan `evaluation` menjadi rujukan isi `/incentive/[id]`, tidak disalin.

### Rencana strip-down

Targetnya seperti situs Berkshire Hathaway dan Craigslist: teks, tautan, tabel, dan form bawaan browser.

1. Tulis ulang `Navbar` menjadi daftar tautan lebih dulu. Melepas Tailwind membuat elemen `hidden` tampil, sehingga dua versi menu muncul bersamaan.
2. Buang dependensi: `tailwindcss`, `@tailwindcss/postcss`, `lucide-react` (19 berkas), `next/font` Geist, `wagmi`, `@tanstack/react-query` (0 import), `babel-plugin-react-compiler`.
3. Buang elemen dekoratif: toast (`ToastContext.tsx:39-55`), `ManuscriptStepper`, `StatusBadge`, hero landing, `Footer`, aset `public/*.svg`. Ganti dengan teks polos.
4. Bersihkan 809 baris `className` di 28 berkas dengan codemod.
5. `globals.css` di bawah 15 baris: font bawaan, tautan bawaan, tabel berbingkai tipis. Tanpa warna, ikon, dan animasi.
6. Hapus halaman rusak atau placeholder: `/reviewer/submit`, `/reviewer/update`, `/articles/[id]/peer-reviews`.

Yang dipertahankan: `next`, `react`, `react-dom`, `viem`, `axios`.

### Route

| Path | Peran | Tindakan | Catatan |
|---|---|---|---|
| `/` | Publik | Tulis ulang | Daftar tautan per peran, mode jaringan, tautan storage |
| `/login`, `/register` | Publik | Polos | |
| `/profile` | Login | Tulis ulang | Buat, ekspor, dan impor secret. Kredensial. Tanpa bind wallet dan Google |
| `/journals` | Publik | Baru | Katalog, APC, kebijakan bobot |
| `/author/apc` | Penulis | Baru | Beli note, simpan rahasia note |
| `/author/submit` | Penulis | Tulis ulang | P02 |
| `/author/sessions/[id]` | Penulis | Baru | Status, laporan P03, peringatan `identityExposed`, refund |
| `/author/revise` | Penulis | Tulis ulang | Minor/Major sesuai B3 |
| `/author/disclose` | Penulis | Baru | Selective disclosure sesuai B2 |
| `/editor` | Editor | Tulis ulang | Undangan, naskah anonim, putusan, kriteria. Antrian verifikasi dipindah ke admin |
| `/admin` | Admin | Baru | Verifikasi bidang, kebijakan jurnal, picu epoch, alamat kontrak |
| `/reviewer/assignments` | Penelaah | Tulis ulang | Undangan, buat pseudonim di browser. Kunci tidak dari backend |
| `/reviewer/specialization` | Penelaah | Polos | |
| `/review/[sessionId]` | Penelaah | Tulis ulang | Commit dan reveal, 4 rekomendasi |
| `/reviewer/earnings` | Penelaah | Tulis ulang | Klaim ETH ke alamat baru, klaim dan saldo reputasi |
| `/tracker`, `/tracker/[id]` | Publik | Tulis ulang | 13 status, audit trail dari event, tanpa data asli |
| `/incentive/[id]` | Publik | Baru | Matriks per pseudonim, bobot, skor, imbalan |
| `/articles`, `/articles/[id]` | Publik | Sesuaikan | DOI, open review, komentar, nama setelah disclosure |

### Logika yang ditulis ulang

- `wallet.ts`: chain dan domain EIP-712 dari env. Saat ini hardcoded di 7 titik (`wallet.ts:3,42,71-72,84,103,257`). Di jaringan lokal, `DOMAIN.chainId` yang salah membuat penulis tercatat keliru tanpa error. `fundAndPublish` dibuang.
- Ganti `https://ipfs.io/ipfs/` di 8 baris dengan env gateway.
- `OpenReviewPanel.tsx`: hapus tampilan surel (`:211-212`).

## 13. Batasan

| Batasan | Sumber | Dampak |
|---|---|---|
| Anonimisasi hanya metadata dan sampul | B1 | Identitas di isi PDF tetap terbaca. Sampel demo sengaja bersih |
| Revisi melewati P03-P04 on-chain | B3 | Menyimpang dari Spesifikasi Ciko (Spek hlm. 17-18), laporan pengecekan tidak diulang |
| Semua kasus tanpa mayoritas menjadi zona abu-abu | B3 | Menyimpang dari Lap. hlm. 82, tie-breaker tidak diterapkan |
| Pseudonim baru tiap putaran | B3 | Penulis dan publik tidak bisa melihat penelaah yang sama |
| Daftar `decideBatch` berasal dari operator | Kode Ciko | Server tepercaya untuk menyertakan semua reveal |
| Reveal menunggu semua commit hanya ditegakkan server | Kode Ciko | Sama seperti di atas |
| `reputationId` stabil | A1 | Aktivitas bisa ditautkan antar-epoch, tetapi tidak ke nama |
| Korelasi waktu transaksi | A2 | Setor APC dan ikat sesi bisa dikorelasikan bila berdekatan |
| Himpunan anonim demo kecil | Skala demo | Lap. Ciko hlm. 123 menganggap N di bawah 3 lemah |
| ZK adalah simulasi | Instruksi pengguna | Attestor melihat witness dan sifat zero-knowledge tidak ada. Nilainya ada pada bentuk alur dan interface |
| Tanpa audit keamanan | Lingkup | Tidak layak produksi |

**Risiko teknis yang dicek paling awal**

| Risiko | Milestone | Cadangan |
|---|---|---|
| Hardhat 3 di Node 24 | M0 | Pakai versi Node yang didukung lewat `nvm` |
| Stack too deep di `ActionGateway` | M2 | `viaIR` |
| `node:sqlite` di NestJS | M3 | `better-sqlite3` |
| Ekstraksi abstrak dari PDF bersampul | M7 | Abstrak dari form pengajuan versi anonim |

## 14. Temuan yang perlu diperhatikan saat mengutip

Temuan ini penting bila karya asal dijadikan rujukan skripsi. Semuanya hasil baca kode, belum dibuktikan dengan menjalankan sistem.

1. **Klaim unlinkability Ciko tidak terpenuhi di ledger.** `PermanentAccountRegistered` dan `EphemeralAccountCreated` memuat commitment yang sama, sehingga pseudonim bisa ditautkan ke akun permanen. Evaluasi "0 forbidden field" (Lap. hlm. 119) hanya mengukur proyeksi API (`quantitative-metrics.util.ts:88-100`). Ditangani di M2.
2. **Alur server Ciko tidak bisa selesai di chain sungguhan.** Tidak ada endpoint status 9 dan `recordRevision`. Tes e2e-nya memakai mock, begitu juga tes `MinorRevision` yang tidak benar-benar menguji revisi. Ditangani di M4 dan M5.
3. **Angka ROI Sybil Hugo (0,07) memakai sigmoid off-chain.** Kontrak memakai fungsi rasional lain (`IncentiveEngine.sol:268-276`). Hitungan ulang subagent memberi sekitar 0,41, tetapi belum diukur di EVM. Jangan dikutip untuk sistem ini sebelum diukur ulang.
4. **Simulasi multi-siklus Hugo berbeda dari kontrak.** `runMulticycle` hanya meluruhkan penelaah tertentu, sedangkan di kontrak penelaah aktif dengan jarak 30 hari kehilangan sekitar 45% saldo tiap siklus. Pertumbuhan pada Tabel VI.16 tidak akan sama on-chain.
5. **Mock plagiarisme Roihan bisa menolak semua naskah.** `mockCID` menghasilkan skor 93, di atas ambang 30, bila Pinata dan API plagiarisme tidak dikonfigurasi.
6. **`$CIKO/contracts/ignition/parameters.json` berisi 3 kunci privat teks jelas.** Anggap sudah bocor. Jangan didanai atau dipakai ulang.
