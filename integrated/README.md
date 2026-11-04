# DecPub Terintegrasi

Integrasi tiga tugas akhir (Ciko, Hugo, Roihan) menjadi satu sistem publikasi ilmiah
anonim (triple blind) dengan insentif penelaah. Rancangan: `../docs/arsitektur.md`.
Urutan kerja: `../docs/PLAN.md`. Status: `../docs/PROGRESS.md`.

**Status saat ini: M7 selesai.** Kontrak Ciko (M0), storage simulator (M1), ZK simulasi,
`ActionGateway`, dan pseudonim tanpa tautan (M2), backend P01-P04 (M3), P05-P08 jalur diterima (M4),
revisi, zona abu-abu, dan penolakan (M5), kontrak escrow dan insentif Hugo (M6), serta insentif di backend
(APC di muka, QoS, imbalan otomatis, klaim, reputasi, refund; M7) berjalan.
Pelengkap Roihan dan frontend menyusul (M8 dst).
Target akhir: `npm install && npm run demo`.

## Prasyarat

- Node >= 22 (diuji di Node 24.11.0), npm 11.

## Menjalankan (M0 sampai M7)

```bash
cd integrated
npm install
npm run chain            # terminal 1: node Hardhat di http://127.0.0.1:8545
npm run deploy:local     # terminal 2: deploy 9 kontrak Ciko + verifier + gateway + 3 kontrak Hugo, pasang izin
npm run check-wiring     # periksa semua izin dan keterhubungan (83 pemeriksaan)
npm run test:contracts   # tes kontrak (Ciko, verifier, gateway, EscrowPool, IncentiveEngine, ReputationSBT)
npm run test:incentive   # M6: mesin insentif off-chain Hugo + model referensi bilangan bulat

npm run storage          # simulator storage di http://127.0.0.1:8081 (tetap hidup)
npm run test:storage     # tes StorageProvider, kripto klien, simulator
npm run zk               # M2: zk-sim di http://127.0.0.1:8082 (tetap hidup)
npm run test:zk          # tes zk-sim
npm run test:shared      # tes kripto klien
npm run server           # M3: server NestJS di http://127.0.0.1:3001 (Swagger: /api), butuh chain + deploy + storage + zk
npm run test:server      # tes server
npm test                 # semua tes di atas
npm run typecheck
npm run demo:m1          # demo/regresi M1: mandiri, memakai data sementara
npm run demo:m2          # demo/regresi M2: butuh `chain` + `deploy:local`, zk-sim dinyalakan sendiri
npm run demo:m3          # demo/regresi M3: butuh `chain` + `deploy:local`; storage, zk, dan server dinyalakan sendiri sebagai proses nyata
npm run demo:m4          # demo/regresi M4: P05-P08 jalur diterima sampai Published, audit trail dari event (prasyarat sama)
npm run demo:m5          # demo/regresi M5: revisi Minor/Major, zona abu-abu, desk reject/revisi desk, no-show (prasyarat sama)
npm run demo:m6          # demo/regresi M6: escrow, refund, timeout, distribusi D1 = Lampiran B Hugo, klaim, decay (prasyarat sama; zk-sim dinyalakan sendiri)
npm run demo:m7          # demo/regresi M7: APC di muka, imbalan sesuai kualitas, laporan QoS = hash on-chain, klaim, reputasi per epoch, q4 sesi kedua, refund (prasyarat sama)
```

`demo:m6` memajukan jam chain lebih dari 180 hari dan `demo:m7` beberapa hari (`evm_increaseTime`). Tidak merusak demo lain; jalankan ulang
`npm run chain` dan `npm run deploy:local` bila ingin jam chain kembali normal.

### Storage publik (M1)

Buka http://127.0.0.1:8081 di browser: form unggah, form cari berdasarkan ID (CID), tautan buka/unduh.
Halaman tanpa JavaScript dan tanpa CSS. API-nya subset Kubo (`POST /api/v0/add`, `GET|HEAD /ipfs/<cid>`).

Menukar ke IPFS sungguhan: isi `STORAGE_API_URL` (Kubo `:5001`) dan `STORAGE_GATEWAY_URL` (Kubo `:8080`),
lalu jalankan rangkaian tes yang sama melawan Kubo: `npm run test:external -w packages/shared`.
Catatan: CID sama dengan Kubo hanya untuk berkas <= 256 KiB. Kode memperlakukan CID sebagai
nilai opaque dan selalu menghitungnya lewat `StorageProvider.cidOf`.

### ZK simulasi, gateway, pseudonim (M2)

`ActionGateway` adalah satu-satunya session manager di kontrak Ciko. Server hanya menjadi *operator*
gateway untuk langkah sistem, dan tidak bisa memalsukan aksi pihak lain: pembuatan pseudonim butuh
bukti ZK, aksi penulis/editor/penelaah butuh tanda tangan EIP-712 pseudonim.

- `[SIMULASI]` bukti ZK = tanda tangan attestor (`services/zk-sim`) atas sinyal publik, setelah witness
  diperiksa. Attestor melihat witness, jadi ini bukan zero-knowledge. Kontrak hanya memverifikasi
  tanda tangan (`SimulatedZkVerifier`). Mengganti dengan sirkuit nyata: implementasikan `IZkVerifier`
  lalu `ActionGateway.setVerifier`, dan ganti `ZkProver` di klien.
- Kunci attestor dan penerbit kredensial: `ATTESTOR_PRIVATE_KEY`, `ISSUER_PRIVATE_KEY`. Di lokal bila
  kosong dipakai kunci dev turunan (PUBLIK, hanya untuk lokal). Di jaringan non-lokal wajib diisi.
- `npm run compile -w contracts` juga menulis ulang `packages/shared/src/abis.generated.ts`.

Alamat tersimpan di `contracts/deployments/localhost.json` (tidak masuk git).
`deploy:local` memakai `--reset`, jadi aman diulang setelah node dimulai ulang.

## Struktur

```text
packages/shared/          StorageProvider, CID, kripto klien (secret, pseudonim, nullifier),
                          ZkProver, aksi EIP-712, ABI hasil generasi
services/storage-sim/     simulator IPFS + halaman HTML (Express)
packages/incentive-core/  salinan mesin insentif Hugo (normalisasi, BWM, ECWM, fusi, TOPSIS) + model referensi kontrak
services/zk-sim/          attestor bukti ZK simulasi (Express)
scripts/milestones/       demo:mN, dipertahankan sebagai uji regresi
contracts/
  contracts/ciko/         9 kontrak Ciko (salinan; hanya EphemeralAccounts diubah)
  contracts/zk/           IZkVerifier, SimulatedZkVerifier
  contracts/gateway/      ActionGateway
  contracts/hugo/         EscrowPool, IncentiveEngine, ReputationSBT (M6)
  hugo-params.ts          parameter kontrak Hugo (APC, timeout, decay), dipakai Ignition dan check-wiring
  ignition/modules/       Integrated.ts = CikoSystem.ts + verifier + gateway + Hugo + izin
  wiring.ts               daftar izin, dipakai modul dan check-wiring
  scripts/                export-addresses.ts, check-wiring.ts, export-abis.ts
  test/ciko/              tes asli Ciko (disesuaikan untuk EphemeralAccounts)
  test/integrated/        tes verifier, gateway, EscrowPool, IncentiveEngine, ReputationSBT, gas
```

## Catatan

- `deploy:local` memakai akun Hardhat indeks 0 sebagai admin dan indeks 1 sebagai
  operator/relayer (`OPERATOR_ACCOUNT_INDEX`). Sejak M2 operator hanya punya hak di `ActionGateway`,
  bukan di kontrak Ciko.
- Kunci akun Hardhat bawaan itu publik. Jangan dipakai di jaringan sungguhan.
- `Ciko/.../ignition/parameters.json` berisi kunci privat teks jelas dan sengaja tidak disalin.

### Backend P01-P04 (M3)

Server NestJS (`server/`, port 3001) memakai SQLite (`node:sqlite`) dan dijalankan lewat
`@swc-node/register` (perlu metadata dekorator; `tsx` tidak mendukungnya). Semua tulisan ke chain
lewat `ActionGateway`: server hanya operator (relayer) dan tidak punya hak langsung ke kontrak Ciko.

Alur dari sisi klien (juga dipraktikkan `scripts/lib/member.ts`, yang akan sama dengan frontend):

1. `POST /auth/register` lalu `/auth/login` (JWT). `POST /me/identity {identityCommitment, permanentAddress}`
   mendaftarkan `H(secret)` di `PermanentAccounts`. Secret dibuat dan disimpan di klien, tidak pernah dikirim ke server.
2. `GET /me/credentials`: kredensial peran dan bidang (tanda tangan penerbit), dipakai sebagai witness bukti ZK.
3. `POST /manuscripts/intake` (multipart): berkas asli + identitas disimpan terenkripsi (AES-256-GCM) di storage privat;
   hash dan CID naskah anonim dihitung. Balasannya adalah nilai yang ditandatangani pseudonim.
4. Klien membuat bukti di zk-sim lalu `POST /flows/ephemeral-account` (tanpa JWT, agar pseudonim tidak bisa ditautkan ke akun),
   menandatangani `CreateSession` (EIP-712), dan `POST /flows/submission`. Server lalu menjalankan P03 (cek + plagiarisme +
   laporan ke storage publik) dan P04 (unggah naskah anonim, cocokkan CID/hash dengan on-chain, status 5).
5. `POST /flows/sessions/:id/advance {recheck:true}` mengulang P03 untuk sesi `Incomplete`.

PDF contoh: `GET /manuscripts/samples/{clean|identity-exposed|incomplete|plagiarized|too-long}?seed=...`.

Akun demo (password publik, hanya lokal): `admin@desci.local`/`admin123`; editor `editor@desci.local`,
`editor.ai@desci.local`, `editor.chain@desci.local`, `editor.data@desci.local` (`editor123`); penelaah
`rev1@mail.com`..`rev6@mail.com` (password = nama depan, mis. `rev1`); penulis `author1@mail.com`..`author3@mail.com`
(`author1`..). Matikan dengan `SEED_DEMO_ACCOUNTS=false`.

`[SIMULASI]` plagiarisme: tumpang tindih 5-gram kata terhadap `server/corpus/*.txt`, ambang 30. Pengganti: `PlagiarismProvider`.

### Editor, penelaah, dan keputusan (M4)

Semua aksi manusia di bawah memakai pseudonim (kunci diturunkan dari secret di klien) dan, kecuali kotak masuk,
**tanpa JWT**. Langkah sistem dijalankan `ProgressService` (idempoten, diserialkan per sesi) setiap kali sebuah aksi masuk;
`POST /system/sessions/:id/progress` menjalankannya manual (berguna bila `AUTO_ADVANCE=false` atau ada langkah tertunda).

1. Setelah P04 sistem mengundang **satu editor acak** yang terdaftar dan sebidang dengan kategori jurnal.
   `GET /invitations` (JWT editor/penelaah) menampilkan undangan beserta `inviteSalt` (rahasia penerima) dan tautan naskah anonim.
2. Editor membuat pseudonim Editor (zk-sim), lalu `POST /flows/assignments/editor` dengan bukti kepemilikan undangan
   (`ASSIGNMENT_OWNERSHIP`, witness: salt). Sistem memanggil `assignEditor` dan mencatat bukti penugasan.
3. `POST /flows/editorial-screening`: putusan bertanda tangan pseudonim + laporan (komentar, bidang penelaah, catatan internal).
   Hash laporan diperiksa server; yang publik diunggah ke storage, yang lengkap ke storage privat. `Proceed` mencatat kriteria
   dan sistem memilih **3 penelaah acak** per bidang (bukan penulis naskah, belum pernah diundang di sesi itu), mencatat batch
   dan bukti penugasan (`ASSIGNMENT`, simulasi; berkas bukti di storage, `proofRef` = keccak256 berkas).
4. Penelaah membuat pseudonim Reviewer (slot = nomor batch) lalu `POST /flows/assignments/bind`. Setelah semua mengikat: `UnderReview`, fase Commit.
5. `POST /flows/reviews/commit`: hanya `commitHash` (dihitung klien). Setelah semua commit: fase Reveal.
   `POST /flows/reviews/reveal`: pembukaan + isi telaah; server mencocokkan dengan commit dan hash/CID **sebelum** mengunggah.
6. Setelah semua reveal: fase Closed, `decideBatch` (hanya pseudonim yang reveal), `Accepted` lalu `Published`.

Publik: `GET /public/sessions/:id` (proyeksi; isi telaah tampil setelah fase Closed), `/audit-trail` (kronologi event on-chain),
`/assignment-proofs` (bukti penugasan yang bisa diperiksa lewat `SimulatedZkVerifier.verify`).

Batasan M4: hanya jalur Accept; Minor/Major/Reject/zona abu-abu dan penelaah yang tidak commit/reveal menunggu M5.

### Escrow dan insentif Hugo (M6)

Tiga kontrak di `contracts/contracts/hugo/`. Kontrak Hugo hanya MEMBACA kontrak Ciko (tidak jadi session manager)
dan membaca verifier ZK lewat `ActionGateway.verifier()`, jadi pemasangan verifier sungguhan tetap satu tempat.

- **`EscrowPool`**: penulis menyetor note bernominal tetap (`deposit(H(rahasiaNote))`, APC 0,01 ETH). Relayer mengikatnya ke
  sesi dengan bukti `NOTE_BIND` (note tidak muncul di transaksi ikat). Dana kembali penuh ke alamat baru (`refund`, bukti
  `NOTE_REFUND`) bila sesi ditolak sebelum ada penelaah, atau macet lebih lama dari `idleTimeout` (90 hari) tanpa keputusan.
  Bila ada keputusan penelaah dan status final (atau macet), dana hanya bisa dibagikan ke penelaah yang reveal.
- **`IncentiveEngine`**: `executeDistribution` (hanya operator) menjalankan TOPSIS dan sigmoid Hugo atas baris pseudonim
  yang sudah reveal, mengkredit seluruh escrow tanpa sisa, dan mencatat hash laporan QoS dan kebijakan. Penelaah mengklaim
  ke alamat baru dengan tanda tangan EIP-712 pseudonim (`claimReward`).
- **`ReputationSBT`**: kunci `reputationId = H(secret)`, bukan pseudonim. Mint lewat klaim bertanda bukti `REPUTATION_CLAIM`
  (digabung relayer, jumlah kelipatan 0,25). Decay 2%/hari tidak bisa dihindari dengan `triggerDecay` (di Hugo bisa).

Parameter (APC, timeout, decay) di `contracts/hugo-params.ts`; `APC_AMOUNT_WEI` dan `ESCROW_IDLE_TIMEOUT_SECONDS`
menimpanya saat deploy. `[SIMULASI]` bukti `NOTE_BIND` dan `NOTE_REFUND` diperiksa witness-nya oleh zk-sim
(note ada di pool, belum dibelanjakan, pemilik note yang terikat ke sesi). `REPUTATION_BUCKET` dan `REPUTATION_CLAIM` diperiksa zk-sim sejak M7.

### Insentif di backend (M7)

`ESCROW_REQUIRED=true` (bawaan): sesi baru menunggu APC terikat sebelum pengecekan P03. Server tidak memegang rahasia note
atau dompet penyetor; ia hanya relayer bagi aksi yang sudah dibuktikan klien (tanpa JWT, bukti mengikat semua parameter).

| Endpoint | Fungsi |
|---|---|
| `POST /escrow/bind` | ikat note ke sesi (bukti `NOTE_BIND`), lalu P03 dilanjutkan |
| `POST /escrow/refund` | refund penuh ke alamat baru (gagal P03, desk reject, atau macet melewati timeout) |
| `GET /escrow/:sessionId` | status escrow publik |
| `POST /flows/reviews/reputation-tier` | penelaah menyatakan tingkat reputasi (q4) untuk pseudonim barunya (bukti `REPUTATION_BUCKET`) |
| `GET /incentive/:sessionId` | kebijakan terkunci, matriks QoS per pseudonim, bobot, skor, imbalan, status klaim, laporan QoS |
| `POST /incentive/claim-reward` | klaim imbalan ke alamat baru (tanda tangan EIP-712 pseudonim) |
| `POST /incentive/reputation-claims` | klaim mint reputasi (bukti `REPUTATION_CLAIM`, tanpa sesi dan pseudonim), menunggu epoch |
| `POST /admin/epochs/flush` | admin: mint semua klaim yang menunggu, diacak dan digabung |

Penyelesaian berjalan otomatis saat status final dan ada keputusan penelaah (`ProgressService`): q1 dari timestamp on-chain,
q2/q3 dari `SimulatedQoSProvider` `[SIMULASI]`, q4 dari tingkat yang dibuktikan; bobot dari kebijakan jurnal yang dikunci saat
sesi dibuat; laporan QoS diunggah ke storage dan hash-nya masuk transaksi `executeDistribution`. TOPSIS, sigmoid, dan
pembagian escrow dijalankan kontrak. Variabel env baru: `ESCROW_REQUIRED`, `QOS_PROVIDER` (hanya `simulated`).
