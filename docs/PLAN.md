# Rencana Implementasi

Rancangan dan semua keputusan ada di [`arsitektur.md`](arsitektur.md). Dokumen ini hanya mengatur urutan kerja.

**Definisi selesai proyek** (dari `CLAUDE.md`): skenario demo end-to-end dari pra-pengajuan sampai pasca-publikasi bisa dijalankan dengan satu perintah. Tercapai di M12.

## Aturan lintas milestone

- Jangan mengubah `Hugo/`, `Ciko/`, `Roihan/`. Semua hasil masuk ke `integrated/`.
- Prioritas bila bentrok: alur Ciko, lalu mekanisme Hugo, lalu pelengkap Roihan. Bila konflik besar atau ambigu, berhenti dan tanya.
- Setiap milestone menambah tes, dan skrip `demo:mN`-nya dipertahankan sebagai uji regresi.
- Setiap simulasi menolak kasus negatif dan diberi label `[SIMULASI]` di UI.
- Di akhir sesi, perbarui `docs/PROGRESS.md`.
- Satu milestone untuk satu sesi. Bila ternyata terlalu besar, pecah di batas yang sudah bisa didemokan, lalu catat di `PROGRESS.md`.
- Commit hanya bila diminta.

## Urutan dan dependensi

```text
M0 kontrak Ciko
 |-- M1 storage
 '-- M2 ZK + gateway
       '-- M3 backend, P01-P04   (butuh M1)
             '-- M4 P05-P08 jalur diterima
                   '-- M5 revisi, abu-abu, penolakan
                         |-- M6 kontrak escrow dan insentif
                         |     '-- M7 insentif di backend
                         |           '-- M8 pelengkap Roihan, P08
                         |                 '-- M9 frontend polos
                         |                       '-- M10 frontend penulis
                         |                             '-- M11 frontend editor, penelaah
                         |                                   '-- M12 satu perintah
                         |                                         '-- M13 Sepolia
```

## Ringkasan

| # | Milestone | Selesai bila bisa didemokan |
|---|---|---|
| M0 | Fondasi dan kontrak Ciko | `npm run chain` dan `npm run deploy:local` mencetak alamat, izin terverifikasi, tes Ciko lulus |
| M1 | Storage simulator | Di browser: unggah PDF, cari CID, unduh. `sha256sum` sama, berkas sama menghasilkan CID sama |
| M2 | ZK, gateway, pseudonim | `demo:m2`: pseudonim dibuat, lima kasus negatif ditolak on-chain, event tanpa commitment permanen |
| M3 | Backend, P01-P04 | `demo:m3`: daftar sampai `UnderEditorialScreening`, PDF anonim bisa diunduh via CID, skenario gagal menjadi `Rejected` |
| M4 | P05-P08 jalur diterima | `demo:m4`: 3 Accept sampai `Published`, audit trail kronologis dari event |
| M5 | Revisi, zona abu-abu, penolakan | `demo:m5`: empat jalur mencetak jejak status sesuai diagram |
| M6 | Kontrak escrow dan insentif | `demo:m6`: setor, ikat, selesai, klaim. Refund, timeout, replay teruji. Cocok dengan Lampiran B Hugo |
| M7 | Insentif di backend | `demo:m7`: imbalan berurutan sesuai kualitas, sesi kedua q4 bukan nol, hash laporan QoS cocok on-chain |
| M8 | Pelengkap Roihan dan P08 | `demo:m8`: DOI terbit, disclosure membuka nama, hash asli cocok, penelaah tetap anonim, komentar tampil |
| M9 | Frontend polos, halaman publik | Di browser: halaman teks polos menampilkan data M8. `npm ls` bebas Tailwind, lucide, wagmi |
| M10 | Frontend penulis | Di browser tanpa MetaMask: beli note sampai terbit dan mengungkap identitas |
| M11 | Frontend editor dan penelaah | Seluruh alur di browser dengan lima login, plus halaman transparansi insentif |
| M12 | Satu perintah | Dari clone bersih: S1-S6 dan audit lulus, keluar kode 0, laporan tertulis, service tetap hidup |
| M13 | Sepolia | S1 berjalan di Sepolia dengan tautan Etherscan dan biaya gas terukur |

## Rincian

### M0. Fondasi dan kontrak Ciko

**Tujuan:** workspace berdiri dan kontrak Ciko bisa di-deploy lengkap dengan izinnya.

**Pekerjaan**
- `integrated/package.json` dengan npm workspaces, `.env.example`, `README.md`.
- Salin `$CIKO/contracts/contracts/**` ke `contracts/contracts/ciko/`, beserta `test/`, `hardhat.config.ts`.
- `ignition/modules/Integrated.ts` dari `FullSystem.ts`, ditambah `m.call` izin mengikuti `FullFlow.test.ts:147-180`.
- `scripts/check-wiring.ts` memastikan setiap izin benar.
- **Jangan menyalin** `ignition/parameters.json`.
- Cek paling awal: Hardhat 3 di Node 24, dan apakah jaringan `localhost` perlu dideklarasikan.

**Kriteria selesai**
- `npm run chain` menyalakan node, dan `npm run deploy:local` mencetak 9 alamat.
- `check-wiring` lulus.
- Tes kontrak Ciko lulus. Ini menjadi baseline pertama kode Ciko benar-benar dijalankan.

### M1. Storage simulator

**Tujuan:** pengganti IPFS yang mudah ditukar dengan node sungguhan.

**Pekerjaan**
- `services/storage-sim` (Express): `POST /api/v0/add` (multipart, balasan `{Name, Hash, Size}` seperti Kubo, mendukung `only-hash`), `GET /ipfs/:cid`.
- Halaman HTML polos di `/`: form unggah, form ID untuk mencari, tautan unduh. Tanpa JavaScript bila memungkinkan.
- CIDv1 sha-256 lewat `multiformats`.
- `StorageProvider` di `packages/shared`, dibaca dari `STORAGE_API_URL` dan `STORAGE_GATEWAY_URL`.

**Kriteria selesai**
- Di browser: unggah PDF, cari CID, lihat ukuran, unduh.
- `sha256sum` berkas unduhan sama dengan aslinya, berkas sama menghasilkan CID sama, dan CID tak dikenal memberi 404.
- Tes `StorageProvider` melawan simulator lulus. Tes yang sama tertulis agar bisa dijalankan melawan Kubo.

### M2. ZK, gateway, pseudonim

**Tujuan:** pseudonim yang tidak bisa ditautkan, aksi bertanda tangan, dan bukti simulasi yang benar-benar menolak kasus salah.

**Pekerjaan**
- `services/zk-sim`: `POST /prove` memeriksa witness lalu menandatangani, `POST /verify`. Witness tidak disimpan dan tidak masuk log.
- `IZkVerifier`, `SimulatedZkVerifier`.
- Ubah `EphemeralAccounts` sesuai `arsitektur.md` bagian 9.
- `ActionGateway`: aksi bertanda tangan, aksi ber-ZK, passthrough operator, `setVerifier`. Gateway menjadi satu-satunya session manager.
- `packages/shared`: pembuatan secret, turunan pseudonim, tipe EIP-712, hash commit, `ZkProver`. Dipakai frontend dan skrip.
- Sesuaikan tes Ciko yang terdampak.

**Kriteria selesai** (`demo:m2`)
- Pseudonim Author dibuat dengan bukti sah.
- Ditolak on-chain: secret salah, peran salah, sesi salah, nullifier dipakai ulang, tanda tangan palsu.
- Satu orang bisa membuat pseudonim di dua sesi berbeda.
- Event `EphemeralAccountCreated` tidak memuat commitment permanen.
- Server yang memanggil kontrak Ciko langsung, tanpa gateway, gagal `OnlySessionManager`.

### M3. Backend, P01-P04

**Tujuan:** naskah masuk dan menjadi anonim, tersimpan terpisah antara publik dan privat.

**Pekerjaan**
- Pindahkan `$CIKO/server/src`: `blockchain`, `contracts`, `flows`, `manuscripts`, `query`, `public`. Semua tulisan lewat gateway. Port 3001.
- SQLite (`node:sqlite`, cadangan `better-sqlite3`) di balik lapisan repositori.
- Port dari Go: `auth`, `users`, `journals` beserta seed akun demo dan kebijakan bobot. Wallet seed Roihan tidak dipakai.
- `verification`: penerbitan kredensial peran dan bidang.
- P01 registrasi, P02 intake dan sesi, P03 cek dan `PlagiarismProvider`, P04 anonimisasi apa adanya dan unggah ke storage.
- `PrivateStore` AES-256-GCM. `metadataHash` diberi salt.
- Perbaikan: `result` P03 dari server, batasi `GET /manuscripts/:id/manifest`, label peran `flows.dto.ts:22`.
- Sampel PDF tanpa identitas di isi. Sampel kedua yang memuat identitas, untuk menunjukkan peringatan `identityExposed`.
- `ESCROW_REQUIRED=false` sampai M7.

**Kriteria selesai** (`demo:m3`)
- Penulis mendaftar, membuat pseudonim, dan sesi sampai `UnderEditorialScreening`.
- PDF anonim bisa diunduh dari halaman storage, tanpa metadata penulis, dan CID-nya sama dengan on-chain.
- Naskah asli tidak ada di storage publik, dan berkas privat terenkripsi di disk.
- Naskah yang gagal menjadi `Rejected`, `Incomplete` bisa dicek ulang, dan plagiarisme di atas ambang ditolak.
- Swagger tersedia di `/api`.

### M4. P05-P08 jalur diterima

**Tujuan:** tulang punggung alur Ciko berjalan penuh di chain sungguhan, yang di kode asalnya tidak bisa.

**Pekerjaan**
- `selection`: editor acak per kategori, penelaah acak per bidang terverifikasi, mengecualikan penulis.
- `InviteChannel` simulasi, pseudonim editor dan penelaah dibuat klien.
- Endpoint baru untuk status 8 ke 9.
- Commit dan reveal dengan hash dari klien. Reveal dibuka setelah semua commit.
- `decideBatch`, finalisasi `Published`.
- `GET /public/sessions/:id/audit-trail` menjadi kronologi dari event, dan proyeksi publik dibatasi per status.

**Kriteria selesai** (`demo:m4`)
- 3 penelaah Accept, sesi sampai `Published`, melawan node sungguhan tanpa mock.
- Audit trail menampilkan kronologi lengkap.
- Server tidak pernah menerima rekomendasi sebelum reveal, dibuktikan dengan tes.

### M5. Revisi, zona abu-abu, penolakan

**Tujuan:** semua cabang mesin status bisa dilalui, sesuai B3.

**Pekerjaan**
- Endpoint revisi lewat `recordRevisionSigned`, termasuk anonimisasi berkas revisi.
- Batch baru dengan pseudonim baru, dan fase Commit dibuka ulang. Minor mengundang orang yang sama.
- Zona abu-abu: batch tambahan 2 penelaah, lalu agregasi ulang atas seluruh pseudonim.
- Major kembali ke editor yang sama. Desk reject dan revisi desk.
- Tidak ada reveal: kembali ke `AssigningReviewers`.

**Kriteria selesai** (`demo:m5`)
- Empat jalur mencetak jejak status sesuai diagram: minor, major, zona abu-abu, desk reject.
- Hash on-chain berubah setelah revisi.

### M6. Kontrak escrow dan insentif

**Tujuan:** mekanisme dana dan reputasi Hugo selaras dengan anonimitas, teruji di tingkat kontrak.

**Pekerjaan**
- `EscrowPool`, `IncentiveEngine`, `ReputationSBT` sesuai `arsitektur.md` bagian 6 dan 9.
- Port tes `$HUGO/test/contracts/*` ke viem dan `node:test`. Port `gas.test.ts` untuk pembanding.

**Kriteria selesai** (`demo:m6`)
- Setor, ikat, selesai, klaim ke alamat baru.
- Refund dini, timeout refund, dan penyelesaian saat revisi macet teruji.
- Replay nullifier, bobot tidak berjumlah 1e18, nilai matriks di atas 1e18, dan pseudonim tanpa reveal ditolak.
- Decay tidak bisa dihindari dengan `triggerDecay`.
- Data D1 menghasilkan nilai on-chain yang sama dengan Lampiran B Hugo, misalnya R1 0,6453 ETH.

### M7. Insentif di backend

**Tujuan:** alur Ciko dan mekanisme Hugo menyatu otomatis.

**Pekerjaan**
- `packages/incentive-core`: salin middleware Hugo, varian sigmoid on-chain, satu sumber preset BWM.
- `SimulatedQoSProvider` dengan penanda bahasa Indonesia, tanpa memuat model.
- Kebijakan bobot per jurnal, dikunci saat sesi dibuat.
- q1 dari timestamp on-chain, q4 dari bukti tingkat.
- Penyelesaian otomatis saat status final. Laporan QoS diunggah, hash masuk transaksi.
- `ESCROW_REQUIRED=true`. Pasang refund di jalur P03 dan P05.
- Klaim imbalan, klaim reputasi per epoch, `GET /incentive/:sessionId`.

**Kriteria selesai** (`demo:m7`)
- Tiga ulasan berbeda kualitas menghasilkan imbalan berurutan sesuai kualitas.
- Sesi kedua menghasilkan q4 bukan nol bagi penelaah yang sama.
- Hash laporan QoS di storage cocok dengan on-chain.
- Transaksi mint tidak memuat pseudonim, dan refund desk reject sampai ke alamat baru.

### M8. Pelengkap Roihan dan P08

**Tujuan:** pasca publikasi lengkap dan fitur pelengkap Roihan aktif.

**Pekerjaan**
- `DOIToken`, `DOILib`, `PublicationRecords`.
- Selective disclosure sesuai B2: membuka naskah asli dan nama, memeriksa hash. Editor opsional.
- Open review, komentar pembaca, kontribusi agregat.
- Antrian verifikasi bidang oleh admin.

**Kriteria selesai** (`demo:m8`)
- DOI terbit saat `Published`, dan artikel tampil anonim sebelum disclosure.
- Disclosure membuka nama, dan hash asli cocok dengan `originalManuscriptHash`.
- Disclosure dengan secret salah ditolak. Penelaah tetap anonim.
- Komentar tampil tanpa surel, dan verifikasi bidang menentukan kandidat seleksi.

### M9. Frontend polos dan halaman publik

**Tujuan:** frontend Roihan berjalan dalam bentuk paling polos, terhubung ke backend baru.

**Pekerjaan**
- Salin `$ROIHAN/frontend`, lalu ikuti strip-down `arsitektur.md` bagian 12.
- `WalletProvider`: dompet dev lokal, MetaMask untuk Sepolia.
- Chain dan domain EIP-712 dari env, gateway storage dari env.
- Halaman: `/`, `/login`, `/register`, `/profile`, `/journals`, `/tracker`, `/tracker/[id]`, `/articles`, `/articles/[id]`, `/incentive/[id]`.

**Kriteria selesai**
- Di browser: halaman teks polos menampilkan data hasil `demo:m8`.
- `npm ls` bebas Tailwind, lucide, wagmi, dan `className` tidak tersisa.
- `npm run build` dan `tsc --noEmit` lulus.
- Bandingkan dengan tangkapan layar: tanpa warna latar, ikon, dan animasi.

### M10. Frontend penulis

**Tujuan:** peran penulis bisa dicoba seluruhnya dari browser.

**Pekerjaan:** `/author/apc`, `/author/submit`, `/author/sessions/[id]`, `/author/revise`, `/author/disclose`. Bagian secret di `/profile`.

**Kriteria selesai**
- Di browser tanpa MetaMask: buat secret, beli note, ajukan, lihat status dan peringatan, revisi, ungkap identitas setelah terbit.
- Refund desk reject bisa dilakukan dari halaman sesi.
- Aksi editor dan penelaah sementara memakai skrip `demo:m8`.

### M11. Frontend editor dan penelaah

**Tujuan:** seluruh alur bisa dicoba manual dari browser.

**Pekerjaan:** `/editor`, `/admin`, `/reviewer/assignments`, `/reviewer/specialization`, `/review/[sessionId]`, `/reviewer/earnings`.

**Kriteria selesai**
- Seluruh alur di browser dengan lima login: penulis, editor, tiga penelaah.
- Klaim imbalan dan reputasi berhasil dari halaman penelaah.
- Halaman `/incentive/[id]` menjelaskan imbalan tanpa alamat asli.
- Langkah uji manual ditulis di `integrated/README.md`.

### M12. Satu perintah

**Tujuan:** memenuhi definisi selesai.

**Pekerjaan**
- `npm run demo` (`scripts/demo.ts`): bersihkan data, nyalakan node, deploy, seed, jalankan semua service, jalankan skenario, tulis laporan, biarkan service hidup. Tersedia `--exit` untuk berhenti setelah selesai.
- Skenario memakai `packages/shared` yang sama dengan frontend:

| # | Skenario | Yang dibuktikan |
|---|---|---|
| S1 | Diterima, terbit, diungkap | Alur utama, DOI, imbalan, reputasi, komentar |
| S2 | Gagal P03 dan desk reject | Refund penuh ke alamat baru |
| S3 | Revisi minor | Batch dan pseudonim baru, hash berubah |
| S4 | Zona abu-abu | Tambahan penelaah, agregasi ulang |
| S5 | Satu no-show dan semua no-show | Imbalan hanya untuk yang reveal, lalu timeout refund |
| S6 | Dua sesi | q4 naik tanpa menaut pseudonim |

- `scripts/audit-anonymity.ts`: membaca seluruh event dan calldata, lalu memastikan nama, surel, alamat permanen, dan note tidak muncul di transaksi sesi. Tes ini menutup celah tes berbasis mock Ciko.

**Kriteria selesai**
- Dari clone bersih: `npm install` dan `npm run demo` meluluskan S1-S6 dan audit, dengan kode keluar 0.
- Laporan `demo-output/report.md` memuat jejak status, hash transaksi, dan tautan halaman.
- Service tetap hidup, dan hasil S1 bisa dibuka di browser.

### M13. Sepolia

**Tujuan:** sistem berjalan di jaringan yang diminta. **Butuh dari pengguna:** RPC, kunci deployer baru, dan ETH testnet.

**Pekerjaan**
- Ignition `--network sepolia` dan pemeriksaan wiring.
- MetaMask untuk setor APC, gas lainnya oleh relayer.
- `evm_increaseTime` tidak tersedia, jadi q1 memakai waktu nyata dan timeout dibuat pendek lewat parameter konstruktor.
- Ukur gas seluruh alur S1. Skrip berhenti bila saldo operator kurang.

**Kriteria selesai**
- S1 berjalan di Sepolia dari awal sampai akhir, dan laporan memuat tautan Etherscan.
- Biaya gas S1 terukur dan tertulis di dokumen.
- `audit-anonymity` lulus terhadap data Sepolia.
