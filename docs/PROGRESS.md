# Progres

Diperbarui di akhir setiap sesi.

## Terakhir diperbarui

2026-11-04, sesi M0.

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

## Tersisa

Milestone berikutnya: **M1, storage simulator** (tidak bergantung pada M2). Setelah itu M2 (ZK, gateway, pseudonim). M1 sampai M13 belum dikerjakan.

## Temuan di lapangan (M0)

Tidak ada yang bertentangan dengan `arsitektur.md` atau `analisis/`. Catatan:

- **Risiko "Hardhat 3 di Node 24" (bagian 13) tertutup.** Kompilasi, tes, node, dan Ignition semua jalan di Node 24.11.0 tanpa `nvm`. Hardhat terpasang 3.x (`hardhat --version` mencetak 3.21.2), solc 0.8.28 diunduh otomatis pada kompilasi pertama (butuh internet sekali).
- **Jaringan `localhost` harus dideklarasikan** di `hardhat.config.ts` (tipe `http`). Sudah ditambahkan, URL dari `RPC_URL`. Jaringan `hardhatMainnet`/`hardhatOp` dan profil `production` (viaIR) milik Ciko tidak dibawa. viaIR baru ditambahkan bila `ActionGateway` kena stack too deep (M2).
- **Perintah tes** Ciko `hardhat test test/*.test.ts` diganti `hardhat test nodejs` karena tes dipindah ke `test/ciko/`.
- **Deploy ulang ke node yang dimulai ulang** memakai `--reset` pada `deploy:local`, supaya jurnal Ignition lama tidak dipakai. Sepolia sengaja tanpa `--reset`.
- **Operator di M0 adalah akun indeks 1** (`OPERATOR_ACCOUNT_INDEX`). Ini sementara. Di M2 operator diganti `ActionGateway`.
- `npm install` melaporkan 12 kerentanan "high" pada rantai dependensi dev (Hardhat dan turunannya). Belum diperiksa. Tidak memengaruhi demo lokal, tetapi perlu dilihat sebelum M13.

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
```

Target akhir: `cd integrated && npm install && npm run demo`.
