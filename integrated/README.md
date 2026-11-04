# DecPub Terintegrasi

Integrasi tiga tugas akhir (Ciko, Hugo, Roihan) menjadi satu sistem publikasi ilmiah
anonim (triple blind) dengan insentif penelaah. Rancangan: `../docs/arsitektur.md`.
Urutan kerja: `../docs/PLAN.md`. Status: `../docs/PROGRESS.md`.

**Status saat ini: M1 selesai.** Kontrak Ciko (M0) dan storage simulator (M1) berjalan.
Target akhir: `npm install && npm run demo`.

## Prasyarat

- Node >= 22 (diuji di Node 24.11.0), npm 11.

## Menjalankan (M0 dan M1)

```bash
cd integrated
npm install
npm run chain            # terminal 1: node Hardhat di http://127.0.0.1:8545
npm run deploy:local     # terminal 2: deploy 9 kontrak + pasang izin, cetak alamat
npm run check-wiring     # periksa semua izin (37 pemeriksaan)
npm run test:contracts   # tes kontrak Ciko (169 tes)

npm run storage          # simulator storage di http://127.0.0.1:8081 (tetap hidup)
npm run test:storage     # tes StorageProvider + simulator (23 tes)
npm run typecheck
npm run demo:m1          # demo/regresi M1: mandiri, memakai data sementara
```

### Storage publik (M1)

Buka http://127.0.0.1:8081 di browser: form unggah, form cari berdasarkan ID (CID), tautan buka/unduh.
Halaman tanpa JavaScript dan tanpa CSS. API-nya subset Kubo (`POST /api/v0/add`, `GET|HEAD /ipfs/<cid>`).

Menukar ke IPFS sungguhan: isi `STORAGE_API_URL` (Kubo `:5001`) dan `STORAGE_GATEWAY_URL` (Kubo `:8080`),
lalu jalankan rangkaian tes yang sama melawan Kubo: `npm run test:external -w packages/shared`.
Catatan: CID sama dengan Kubo hanya untuk berkas <= 256 KiB. Kode memperlakukan CID sebagai
nilai opaque dan selalu menghitungnya lewat `StorageProvider.cidOf`.

Alamat tersimpan di `contracts/deployments/localhost.json` (tidak masuk git).
`deploy:local` memakai `--reset`, jadi aman diulang setelah node dimulai ulang.

## Struktur

```text
packages/shared/          StorageProvider (+ rangkaian tes kontrak), CID
services/storage-sim/     simulator IPFS + halaman HTML (Express)
scripts/milestones/       demo:mN, dipertahankan sebagai uji regresi
contracts/
  contracts/ciko/         9 kontrak Ciko (salinan, belum diubah)
  ignition/modules/       Integrated.ts = CikoSystem.ts + izin
  wiring.ts               daftar izin, dipakai modul dan check-wiring
  scripts/                export-addresses.ts, check-wiring.ts
  test/ciko/              tes asli Ciko
```

## Catatan

- `deploy:local` memakai akun Hardhat indeks 0 sebagai admin dan indeks 1 sebagai
  operator (`OPERATOR_ACCOUNT_INDEX`). Mulai M2 operator diganti `ActionGateway`.
- Kunci akun Hardhat bawaan itu publik. Jangan dipakai di jaringan sungguhan.
- `Ciko/.../ignition/parameters.json` berisi kunci privat teks jelas dan sengaja tidak disalin.
