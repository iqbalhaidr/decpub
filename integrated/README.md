# DecPub Terintegrasi

Integrasi tiga tugas akhir (Ciko, Hugo, Roihan) menjadi satu sistem publikasi ilmiah
anonim (triple blind) dengan insentif penelaah. Rancangan: `../docs/arsitektur.md`.
Urutan kerja: `../docs/PLAN.md`. Status: `../docs/PROGRESS.md`.

**Status saat ini: M3 selesai.** Kontrak Ciko (M0), storage simulator (M1), serta ZK simulasi,
`ActionGateway`, dan pseudonim tanpa tautan (M2), serta backend P01-P04 (M3) berjalan.
Target akhir: `npm install && npm run demo`.

## Prasyarat

- Node >= 22 (diuji di Node 24.11.0), npm 11.

## Menjalankan (M0 sampai M3)

```bash
cd integrated
npm install
npm run chain            # terminal 1: node Hardhat di http://127.0.0.1:8545
npm run deploy:local     # terminal 2: deploy 9 kontrak Ciko + verifier + gateway, pasang izin
npm run check-wiring     # periksa semua izin (60 pemeriksaan)
npm run test:contracts   # tes kontrak (Ciko, verifier, gateway)

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
```

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
services/zk-sim/          attestor bukti ZK simulasi (Express)
scripts/milestones/       demo:mN, dipertahankan sebagai uji regresi
contracts/
  contracts/ciko/         9 kontrak Ciko (salinan; hanya EphemeralAccounts diubah)
  contracts/zk/           IZkVerifier, SimulatedZkVerifier
  contracts/gateway/      ActionGateway
  ignition/modules/       Integrated.ts = CikoSystem.ts + verifier + gateway + izin
  wiring.ts               daftar izin, dipakai modul dan check-wiring
  scripts/                export-addresses.ts, check-wiring.ts, export-abis.ts
  test/ciko/              tes asli Ciko (disesuaikan untuk EphemeralAccounts)
  test/integrated/        tes verifier dan gateway
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
