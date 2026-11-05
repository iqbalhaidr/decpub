# DecPub Terintegrasi

Integrasi tiga tugas akhir (Ciko, Hugo, Roihan) menjadi satu sistem publikasi ilmiah
anonim (triple blind) dengan insentif penelaah. Rancangan: `../docs/arsitektur.md`.
Urutan kerja: `../docs/PLAN.md`. Status: `../docs/PROGRESS.md`.

**Status saat ini: M12 selesai.** Seluruh alur, dari pra-pengajuan sampai pasca-publikasi, berjalan dengan satu perintah di jaringan
lokal dan bisa dicoba dari browser. Yang tersisa: Sepolia (M13).

## Satu perintah

```bash
cd integrated
npm install
npm run demo             # menyalakan semuanya, menjalankan S1-S6 dan audit, menulis laporan, layanan tetap hidup
```

Butuh Node >= 22 dan port 8545, 8081, 8082, 3001, 3000 bebas. Chrome dan MetaMask tidak dibutuhkan. Kompilasi pertama mengunduh solc
(butuh internet sekali). Bila port dipakai proses lain, misalnya node dari `npm run chain`, demo berhenti dengan kode 2 dan menyebut
portnya; demo tidak menghentikan proses yang bukan miliknya. Sisa `npm run demo` sebelumnya dihentikan otomatis.

| Skenario | Yang dibuktikan |
|---|---|
| S1 Diterima, terbit, diungkap | Alur utama, DOI, imbalan, reputasi, komentar, selective disclosure, halaman frontend |
| S2 Gagal P03 dan desk reject | Refund penuh ke alamat baru, tanpa penelaah dan tanpa distribusi |
| S3 Revisi minor | Orang yang sama, batch dan pseudonim baru, hash berubah, DOI versi 2 |
| S4 Zona abu-abu | Tambahan dua penelaah baru, agregasi ulang atas lima pseudonim |
| S5 Satu no-show dan semua no-show | Imbalan hanya untuk yang reveal; kandidat habis, lalu timeout refund dan sesi ditutup |
| S6 Dua sesi | q4 naik tanpa menaut pseudonim |
| Audit | Seluruh blok dibaca: nama, surel, secret, alamat permanen, dan note tidak ada di transaksi sesi |

Hasil:

- `demo-output/report.md`: ringkasan, jejak status, hash transaksi, tautan halaman, hasil audit.
- `demo-output/demo-state.json`: akun demo, password, dan secret, untuk melanjutkan di browser (impor secret di `/profile`, rahasia note
  di `/author/apc`). Hanya data lokal; masuk `.gitignore`.
- `data/demo/*.log`: log tiap proses.
- Layanan tetap hidup: frontend http://localhost:3000, storage http://127.0.0.1:8081, API http://127.0.0.1:3001/api, node http://127.0.0.1:8545.

```bash
npm run demo:stop        # menghentikan layanan demo
npm run demo -- --exit   # sama dengan npm run demo, tetapi layanan dihentikan setelah selesai
npm run audit            # mengulang audit anonimitas selama node hidup (kode keluar 1 bila ada pelanggaran)
npm run demo:reset       # menghentikan layanan demo dan menghapus semua data lokal, tanpa menyalakan apa pun
npm run demo:fresh       # reset, lalu menyalakan semua layanan dalam keadaan bersih, tanpa skenario, untuk mencoba manual
```

Setiap `npm run demo` dan `npm run demo:fresh` selalu mulai dari keadaan yang sama, jadi utak-atik sebelumnya tidak terbawa. `demo:fresh` hanya berisi
akun bawaan dan katalog jurnal, tanpa identitas terdaftar, dan menggantikan lima terminal pada jalur manual (langkah 1-10 di bagian M11).
`demo:reset` menghapus `data/`, alamat kontrak lokal, dan laporan demo; tangkapan layar `demo-output/mN` tetap ada. Bila port dipakai proses yang
bukan milik demo, misalnya `npm run server`, perintah menolak dan tidak menghapus apa pun.

Data browser ada di luar jangkauan perintah ini. Setelah reset, token login lama ditolak server, jadi pakai jendela penyamaran baru atau hapus data
situs `localhost:3000`.

Kode keluar `npm run demo`: 0 semua lulus, 1 ada skenario atau audit gagal (laporan tetap ditulis, layanan tetap hidup untuk diperiksa),
2 tidak bisa dimulai. Port bisa diganti lewat `RPC_URL`, `STORAGE_PORT`, `ZK_PORT`, `SERVER_PORT`, dan `FRONTEND_PORT`.

Skenario berbicara dengan sistem seperti browser (HTTP dan `packages/shared` yang sama dengan frontend) dan menjalankannya sebagai
pemeriksaan otomatis. Untuk menempuh alur dengan tangan di browser, lihat bagian M10 dan M11 di bawah. `demo:m11` menempuh alur yang
sama di Chrome sungguhan.

## Prasyarat

- Node >= 22 (diuji di Node 24.11.0), npm 11.

## Menjalankan per komponen (M0 sampai M11)

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
npm run demo:m8          # demo/regresi M8: verifikasi bidang menentukan kandidat, DOI, artikel anonim, open review, komentar, selective disclosure, revisi + DOI versi 2 (prasyarat sama)
npm run demo:m9          # demo/regresi M9: frontend diuji di Chrome sungguhan (prasyarat di bawah)
npm run demo:m10         # demo/regresi M10: alur penulis penuh di Chrome sungguhan tanpa MetaMask (butuh chain + deploy:local, Chrome, port 3000 bebas)
```

### Frontend polos (M9)

Teks, tautan, tabel, dan form bawaan browser; tanpa warna, ikon, atau animasi. Halaman: `/` `/login` `/register` `/profile`
`/journals` `/tracker` `/tracker/<sessionId>` `/articles` `/articles/<sessionId>` `/incentive/<sessionId>`.

```bash
npm run chain && npm run deploy:local          # chain baru (terminal 1 dan 2)
DEMO_KEEP=1 npm run demo:m8                    # data: 2 artikel terbit; storage, zk, server tetap hidup (:8081, :8082, :3001)
npm run frontend                               # http://localhost:3000   (atau: npm run demo:m9 untuk uji otomatis di Chrome)
kill $(cat data/demo-keep/pids)                # menghentikan layanan
```

Mencoba manual: buka `/articles` lalu salah satu artikel (DOI, open review, komentar), `/incentive/<id>` dari tautan di artikel,
`/tracker` untuk membuka sesi lewat ID. Daftar di `/register` (akun demo lokal ada di `/login`), masuk, lalu di `/profile`:
buat secret (ekspor dan simpan; hanya ada di browser), daftarkan identitas, lihat kredensial. Buka frontend lewat `localhost:3000`
atau `127.0.0.1:3000` (keduanya diizinkan CORS server).

Alamat backend, RPC, gateway storage, dan zk-sim diatur lewat `frontend/.env.local.example` (`NEXT_PUBLIC_*`).
Dev dan build memakai webpack (`--webpack`) karena Turbopack tidak memetakan impor `./x.js` ke `x.ts` di `@decpub/shared`.
```

### Frontend penulis (M10)

Seluruh peran penulis bisa dicoba dari browser, tanpa MetaMask (di jaringan lokal, setor APC memakai akun Hardhat terbuka; di Sepolia memakai
MetaMask). Halaman: `/author` (naskah saya), `/author/apc`, `/author/submit`, `/author/sessions/<id>`, `/author/revise`, `/author/disclose`.
Halaman editor, penelaah, dan admin ada di bagian M11 di bawah.

Jalur manual (setelah `npm run chain`, `npm run deploy:local`, lalu layanan hidup):

1. `/register` lalu `/login` sebagai penulis. Di `/profile`: buat secret (ekspor!), daftarkan identitas.
2. `/author/apc`: beli satu note (setor 0,01 ETH ke escrow). Ekspor rahasia note juga; kehilangannya berarti kehilangan APC.
3. `/author/submit`: isi form, pilih berkas PDF atau PDF contoh (`clean`, `identity-exposed`, `plagiarized`, ...), pilih note, Ajukan.
   Halaman mencatat tiap langkah: unggah, pseudonim (bukti zk-sim), tanda tangan EIP-712, ikat APC.
4. `/author/sessions/<id>`: status on-chain, hash, hasil P03 beserta peringatan `identityExposed`, posisi pada alur, escrow. Halaman memuat ulang tiap 5 detik.
5. Editor dan penelaah: lanjutkan dengan langkah uji manual M11 di bawah (atau `DEMO_KEEP=1 npm run demo:m8` bila ingin sisi mereka dijalankan skrip).
   Saat status `MinorRevisionRequired`/`MajorRevisionRequired`, `/author/revise` membuka; setelah `Published`, `/author/disclose` membuka.
6. Naskah ditolak sebelum ada penelaah (gagal P03 atau desk reject): di halaman sesi, "Buat alamat baru" lalu "Refund".

```bash
npm run demo:m10         # otomatis: membangun frontend, membukanya di Chrome sungguhan, menempuh langkah 1-6 dan memeriksa privasi
```

Penulis memanggil zk-sim langsung dari browser (butuh CORS; asal bawaan `localhost:3000` dan `127.0.0.1:3000`, env `ZK_CORS_ORIGIN`),
karena secret tidak boleh lewat server. Bukti zk-sim adalah **simulasi**: zk-sim melihat witness.

`demo:m6` memajukan jam chain lebih dari 180 hari dan `demo:m7` beberapa hari (`evm_increaseTime`). Tidak merusak demo lain; jalankan ulang
`npm run chain` dan `npm run deploy:local` bila ingin jam chain kembali normal.

### Frontend editor, penelaah, dan admin (M11)

Seluruh alur bisa ditempuh manual di browser dengan lima login (penulis, editor, tiga penelaah) ditambah admin. Halaman: `/editor`, `/admin`,
`/reviewer/assignments`, `/reviewer/specialization`, `/review/<ID sesi>`, `/reviewer/earnings`, dan `/incentive/<ID sesi>` (transparansi imbalan).
Tiap anggota membuat secretnya sendiri di `/profile` (tersimpan per akun di `localStorage` browser yang sama, jadi satu browser cukup untuk semua peran;
keluar lalu masuk sebagai peran berikutnya).

**Persiapan.** Empat layanan di terminal terpisah, dengan database server yang **baru** (`rm -f data/server.sqlite`; akun seed dibuat otomatis):
`npm run chain` lalu `npm run deploy:local` (sekali), kemudian `npm run storage`, `npm run zk`, `npm run server`, `npm run frontend`; buka http://localhost:3000.
Akun seed ada di halaman `/login` (admin `admin@desci.local`/`admin123`, editor `editor@desci.local`/`editor123`, penelaah `rev1@mail.com`/`rev1` dst.).
Hanya anggota yang **sudah mendaftarkan identitas** (langkah 1) yang menjadi kandidat seleksi. Karena itu daftarkan identitas hanya bagi editor
`editor@desci.local` dan tiga penelaah yang ingin Anda pakai (mis. `rev1`, `rev2`, dan satu penelaah baru); penelaah seed lain jangan didaftarkan, supaya
ketiganya pasti terpilih. Jangan memakai server sisa `demo:m*` untuk ini: skrip demo sudah mendaftarkan identitas semua akun seed dengan secret yang tidak
dimiliki browser Anda (identitas hanya bisa didaftarkan sekali per akun).

1. **Identitas.** Untuk editor dan tiga penelaah: `/login` lalu `/profile` → "Buat secret baru" (ekspor!) → "Daftarkan identitas".
   Untuk penelaah yang baru mendaftar (`/register`, peran penelaah, pilih bidang): buka `/reviewer/specialization`, minta bidang `ai`.
2. **Admin** (`/admin`): setujui permintaan bidang penelaah baru (tanpa persetujuan ia bukan kandidat dan tidak mendapat kredensial peran).
3. **Penulis** (langkah M10): beli note di `/author/apc`, ajukan naskah di `/author/submit` (PDF contoh `clean`, isi abstrak).
   Setelah P03-P04 sesi menjadi `UnderEditorialScreening` dan sistem mengundang editor.
4. **Editor** (`/editor`): lihat undangan dan naskah anonim (PDF tanpa identitas penulis), "Terima undangan" (membuat pseudonim Editor di browser),
   pilih putusan (Proceed dengan bidang penelaah, Revise, atau DeskReject), "Kirim putusan". Bila kandidat terverifikasi kurang dari tiga, halaman
   menampilkan `TERTUNDA`; setelah admin menyetujui bidang, di `/admin` isi ID sesi lalu "Jalankan langkah sistem".
5. **Penelaah** (`/reviewer/assignments`): "Terima" tiap undangan (pseudonim Reviewer baru dan pernyataan tingkat reputasi). Setelah ketiganya menerima,
   buka `/review/<ID sesi>` (tautan "Telaah"): **langkah 1 commit** (rekomendasi + teks; hanya hash yang dikirim), lalu setelah ketiga penelaah commit,
   **langkah 2 reveal**. Data commit hanya ada di browser itu sampai reveal: jangan membersihkan data situs di antaranya.
6. **Keputusan dan terbit**: setelah ketiga reveal sistem memutuskan; tiga `AcceptAsIs` berujung `Published` dengan DOI di `/articles`.
7. **Imbalan** (`/reviewer/earnings`, tiap penelaah): "Buat alamat baru" lalu "Klaim imbalan" (simpan kunci privat alamat itu), lalu "Klaim reputasi".
   `/incentive/<ID sesi>` menjelaskan asal imbalan: hanya pseudonim, tanpa alamat dompet.
8. **Epoch** (`/admin`): "Picu epoch" memint klaim reputasi berkelompok; saldo tampil di `/reviewer/earnings`.
9. **Opsional**: editor mengungkap identitas di `/editor` (sesi `Published`); penulis di `/author/disclose`; penelaah tidak pernah. Komentar pembaca di halaman artikel.
10. **Cabang lain**: DeskReject oleh editor lalu refund oleh penulis (`/author/sessions/<id>`); penelaah yang tidak merespons: `/admin` → "Tutup fase".

```bash
npm run demo:m11         # otomatis: langkah 1-10 di Chrome sungguhan (lima login + admin), dengan pemeriksaan privasi dan polos
```

Catatan: browser menghitung CID dokumen telaah lewat `POST /api/v0/add?only-hash=true` ke storage (teks telaah tidak boleh lewat server sebelum reveal),
jadi storage-sim mengizinkan CORS dari `localhost:3000` dan `127.0.0.1:3000` (env `STORAGE_CORS_ORIGIN`). Pada Kubo, setel
`API.HTTPHeaders.Access-Control-Allow-Origin`. Jalur MetaMask belum pernah dijalankan (tidak ada MetaMask di lingkungan uji).

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
scripts/demo.ts           npm run demo: satu perintah (M12)
scripts/scenarios/        skenario S1-S6 dan konteks bersamanya
scripts/audit-anonymity.ts  audit seluruh ledger; juga bisa dijalankan sendiri (npm run audit)
scripts/test/             tes aturan audit dengan ledger buatan
scripts/milestones/       demo:mN, dipertahankan sebagai uji regresi
scripts/lib/              klien skrip (Member, Api, flow), layanan proses nyata (services.ts, mode DEMO_KEEP), tumpukan demo (stack.ts), laporan (report.ts), pengendali Chrome (browser.ts)
frontend/                 Next.js polos: halaman publik, akun, secret (M9), penulis (M10), editor, penelaah, admin (M11); WalletProvider
contracts/
  contracts/ciko/         9 kontrak Ciko (salinan; hanya EphemeralAccounts diubah)
  contracts/zk/           IZkVerifier, SimulatedZkVerifier
  contracts/gateway/      ActionGateway
  contracts/hugo/         EscrowPool, IncentiveEngine, ReputationSBT (M6)
  contracts/roihan/       DOIToken (salinan Roihan, tanpa perubahan), DOILib (diekstrak dari PublicationRegistry) (M8)
  contracts/records/      PublicationRecords: rujukan final, DOI, selective disclosure (M8)
  hugo-params.ts          parameter kontrak Hugo (APC, timeout, decay), dipakai Ignition dan check-wiring
  ignition/modules/       Integrated.ts = CikoSystem.ts + verifier + gateway + Hugo + izin
  wiring.ts               daftar izin, dipakai modul dan check-wiring
  scripts/                export-addresses.ts, check-wiring.ts, export-abis.ts
  test/ciko/              tes asli Ciko (disesuaikan untuk EphemeralAccounts)
  test/integrated/        tes verifier, gateway, EscrowPool, IncentiveEngine, ReputationSBT, PublicationRecords, gas
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

### Pasca-publikasi dan pelengkap Roihan (M8)

Saat sesi `Published`, `ProgressService` memanggil `PublicationRecords.recordFinal`: DOI (`10.55121/<tahun>.<chainId>.<nomor>.<versi>`,
versi = revisi + 1) dimint sebagai NFT `DOIToken` yang dimiliki **kontrak** (bukan akun penulis, supaya tidak menaut penulis ke naskah).
`[SIMULASI]` DOI tidak terdaftar di registrar mana pun. Artikel tampil anonim sampai penulis memilih mengungkap diri.

| Endpoint | Fungsi |
|---|---|
| `GET /articles`, `GET /articles/:sessionId` | daftar dan detail artikel terbit (DOI, hash on-chain, pengungkapan beserta cek hash) |
| `GET /articles/:sessionId/open-review` | laporan editorial dan telaah per batch (pseudonim, rekomendasi, isi, cek hash), tanpa surel |
| `GET/POST /articles/:sessionId/comments` | komentar pembaca: hash di `DOIToken.postComment`, isi di server; POST butuh login |
| `POST /flows/disclosure` | selective disclosure penulis (atau editor, opsional) dengan bukti `SELECTIVE_DISCLOSURE` |
| `GET /stats` | kontribusi agregat platform (angka saja) |
| `GET /me/contributions` | kontribusi milik sendiri (jumlah artikel terbit, penyaringan, telaah) |
| `GET/POST /admin/field-requests...` | antrian verifikasi bidang penelaah oleh admin (sejak M3); hasilnya menentukan kandidat seleksi |

**Selective disclosure.** Klien membuat bukti di zk-sim dari secret: pseudonim Author (atau Editor) sesi itu dimiliki pemegang akun permanen
yang sama, dan `attributesHash` dihitung dari atribut yang DIPILIH + salt. Server memeriksa bukti di verifier on-chain, mencocokkan atribut
dengan data pengajuan (bukti tidak bisa menjamin kebenaran atribut), memeriksa komitmen metadata dan sha256 naskah asli terhadap hash
on-chain, mencatat di `PublicationRecords`, dan baru kemudian mengunggah naskah asli ke storage publik (CID sudah tercatat on-chain).
Atribut yang tidak dipilih tidak pernah tersimpan atau terkirim. **Penelaah tidak punya jalur pengungkapan**: ditolak di DTO, zk-sim, dan kontrak.

