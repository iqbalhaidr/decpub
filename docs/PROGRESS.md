# Progres

Diperbarui di akhir setiap sesi.

## Terakhir diperbarui

2026-11-04, sesi perancangan.

## Selesai

- Analisis ketiga codebase: [`analisis/hugo.md`](analisis/hugo.md), [`analisis/ciko.md`](analisis/ciko.md), [`analisis/roihan.md`](analisis/roihan.md).
- Sepuluh keputusan abu-abu dan enam default turunan ditetapkan: [`arsitektur.md`](arsitektur.md) bagian 2.
- Rancangan sistem: [`arsitektur.md`](arsitektur.md).
- Rencana milestone M0-M13: [`PLAN.md`](PLAN.md).

## Tersisa

Semua implementasi. Folder `integrated/` belum dibuat. Milestone berikutnya: **M0, fondasi dan kontrak Ciko**.

## Masalah terbuka

- Kode ketiga proyek asal belum pernah dijalankan. Semua temuan berasal dari membaca kode dan laporan. M0 menjadi baseline pertama.
- Kompatibilitas Hardhat 3 dengan Node 24 belum dicek (mesin ini memakai Node 24.11.0).
- M13 butuh RPC Sepolia, kunci deployer baru, dan ETH testnet dari pengguna.

## Cara menjalankan

Belum ada yang bisa dijalankan. Target akhir: `cd integrated && npm install && npm run demo`.
