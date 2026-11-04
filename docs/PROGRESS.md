# Progres

Diperbarui di akhir setiap sesi.

## Terakhir diperbarui

2026-11-04, sesi M1.

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

## Tersisa

Milestone berikutnya: **M2, ZK, gateway, pseudonim** (`services/zk-sim`, `IZkVerifier`, `ActionGateway`, ubah `EphemeralAccounts`, kripto klien di `packages/shared`). Lalu M3 (butuh M1, sudah ada). M2 sampai M13 belum dikerjakan.

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

## Masalah terbuka

- Kode Hugo dan Roihan belum pernah dijalankan (baru Ciko di M0). Tes Hugo dijalankan saat M6.
- Kompatibilitas pragma `^0.8.24` kontrak Hugo/Roihan dengan solc 0.8.28 belum diuji (M6, M8).
- M13 butuh RPC Sepolia, kunci deployer baru, dan ETH testnet dari pengguna.

## Cara menjalankan

```bash
cd integrated
npm install
npm run chain            # terminal 1, tetap hidup
npm run deploy:local     # terminal 2
npm run check-wiring
npm run test:contracts

npm run storage          # M1: simulator storage di http://127.0.0.1:8081, tetap hidup
npm run test:storage     # tes M1
npm run demo:m1          # demo/regresi M1
```

Target akhir: `cd integrated && npm install && npm run demo`.
