# DecPub Terintegrasi

Integrasi tiga tugas akhir (Ciko, Hugo, Roihan) menjadi satu sistem publikasi ilmiah
anonim (triple blind) dengan insentif penelaah. Rancangan: `../docs/arsitektur.md`.
Urutan kerja: `../docs/PLAN.md`. Status: `../docs/PROGRESS.md`.

**Status saat ini: M0 selesai.** Baru lapisan kontrak Ciko yang berjalan.
Target akhir: `npm install && npm run demo`.

## Prasyarat

- Node >= 22 (diuji di Node 24.11.0), npm 11.

## Menjalankan (M0)

```bash
cd integrated
npm install
npm run chain            # terminal 1: node Hardhat di http://127.0.0.1:8545
npm run deploy:local     # terminal 2: deploy 9 kontrak + pasang izin, cetak alamat
npm run check-wiring     # periksa semua izin (37 pemeriksaan)
npm run test:contracts   # tes kontrak Ciko (169 tes)
```

Alamat tersimpan di `contracts/deployments/localhost.json` (tidak masuk git).
`deploy:local` memakai `--reset`, jadi aman diulang setelah node dimulai ulang.

## Struktur

```text
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
