# Progres

Diperbarui di akhir setiap sesi.

## Terakhir diperbarui

2026-11-04, sesi M3.

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

## Tersisa

Milestone berikutnya: **M4, P05-P08 jalur diterima** (seleksi editor/penelaah, commit-reveal, `decideBatch`, `Published`, audit trail dari event). M4 sampai M13 belum dikerjakan.


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
- **Jenis bukti `ASSIGNMENT` (2) belum punya pemeriksa maupun fungsi gateway.** Arsitektur 8.2 menyebutnya untuk P05/P06, tetapi 8.1 tidak memetakan fungsi gateway mana pun ke jenis itu. Dibiarkan 501 sampai M4 (seleksi) agar konteksnya jelas.
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

## Masalah terbuka

- Kode Hugo dan Roihan belum pernah dijalankan (baru Ciko di M0). Tes Hugo dijalankan saat M6.
- Daftar `decideBatch` dan urutan fase telaah masih dijaga operator (batasan Ciko, arsitektur bagian 13). Gateway meneruskan apa adanya.
- `npm install` melaporkan kerentanan pada rantai dev; belum diperiksa (sama seperti M0).
- Pemeriksa `ASSIGNMENT` ditunda ke M4 (lihat temuan M2).
- Frontend/zk-sim: CORS zk-sim belum diatur (M10). Kebijakan bobot jurnal tersimpan tetapi belum dikunci ke sesi (M7). Refund APC pada Reject/Incomplete-ditutup menunggu M6/M7.
- Kompatibilitas pragma `^0.8.24` kontrak Hugo/Roihan dengan solc 0.8.28 belum diuji (M6, M8).
- M13 butuh RPC Sepolia, kunci deployer baru, dan ETH testnet dari pengguna.

## Cara menjalankan

```bash
cd integrated
npm install
npm run chain            # terminal 1, tetap hidup
npm run deploy:local     # terminal 2 (9 kontrak Ciko + verifier + gateway)
npm run check-wiring     # 60 pemeriksaan
npm run test:contracts

npm run storage          # M1: simulator storage di http://127.0.0.1:8081, tetap hidup
npm run test:storage     # tes M1
npm run demo:m1          # demo/regresi M1

npm run zk               # M2: zk-sim di http://127.0.0.1:8082, tetap hidup
npm run test:zk          # tes M2 (zk-sim)
npm run test:shared      # tes kripto klien
npm test                 # semua tes (kontrak, storage, zk-sim)
npm run demo:m2          # demo/regresi M2 (butuh chain + deploy:local; zk-sim nyala sendiri)

npm run server           # M3: server di http://127.0.0.1:3001 (Swagger /api); butuh chain, deploy, storage, zk
npm run test:server      # tes server
npm run demo:m3          # demo/regresi M3 (butuh chain + deploy:local; menyalakan storage, zk, server sendiri)
```

Target akhir: `cd integrated && npm install && npm run demo`.
