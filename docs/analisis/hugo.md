# Analisis Codebase Hugo

> **Catatan.** Dokumen ini hasil baca statis laporan dan kode oleh subagent. Kodenya belum dijalankan. Bagian "keputusan yang perlu ditanyakan" dan usulan bertanda inferensi sudah dijawab atau digantikan: keputusan final ada di [`docs/arsitektur.md`](../arsitektur.md).

Rujukan kode tanpa awalan relatif terhadap `/home/ihaidar/Projects/DecPub-claude/Hugo/ojs-incentive-main/`. Rujukan laporan memakai nomor halaman tercetak pada `Hugo/TA_Hugo.pdf`, bukan nomor halaman PDF.

Tiga label dipakai untuk memisahkan sumber klaim:

- **Kode:** dibaca langsung dari berkas.
- **Laporan:** tertulis di laporan TA.
- **Inferensi:** kesimpulan atau usulan saya.

**Status verifikasi:** semua hasil ini berasal dari pembacaan. Saya tidak menjalankan `npm install`, tes, server, atau deploy, dan tidak memeriksa Sepolia. Satu-satunya eksekusi adalah dua perhitungan `node -e` tanpa menulis berkas:

- Replikasi rumus pipeline. Hasilnya cocok dengan Lampiran A (off-chain) dan Lampiran B (on-chain) sampai 4 desimal, jadi replikasinya dapat dipercaya untuk data D1.
- Uji regex provider heuristik terhadap contoh ulasan.

**Temuan paling berpengaruh bagi integrasi:**

1. **q4 adalah titik benturan utama dengan Ciko.** q1, q2, dan q3 dapat dihitung tanpa identitas lintas sesi, sedangkan q4 butuh alamat tetap (`server/index.ts:675`). Pseudonim per sesi Ciko membuat q4 selalu 0.
2. **`createBatch` tidak kompatibel dengan alur Ciko.** Satu transaksi memuat alamat penulis, daftar penelaah, dan nama jurnal (`contracts/IncentiveEngine.sol:72-84`), dan penelaah dipilih oleh penulis. Fungsi ini harus dirancang ulang.
3. **Escrow hanya sekali cair dan tidak punya refund mandiri.** Tidak ada refund oleh penulis, timeout, atau pembatalan. Refund hanya terjadi jika operator mengeksekusi batch dengan semua penelaah no-show.
4. **Angka ketahanan laporan memakai sigmoid off-chain.** Kontrak memakai fungsi lain. Inferensi (hitungan saya): ROI Sybil pada D3 menjadi sekitar 0,41 dengan rumus on-chain, bukan 0,07.
5. **`HeuristicProvider` sudah memenuhi antarmuka pengganti LLM, tetapi hanya mengenali bahasa Inggris.** Keenam contoh ulasan berbahasa Indonesia di `frontend/reviewer.ts:58-65` mendapat q3 = 0.

## 1. Tujuan

**Laporan** (Bab I, hlm. 3-4; abstrak, hlm. vi): merancang mekanisme insentif peer review yang menjawab dua rumusan masalah.

- Distribusi insentif hibrida berbasis MCDM yang adaptif terhadap sebaran QoS, sehingga imbalan terdiferensiasi menurut kualitas.
- Pemisahan tegas fungsi ekonomi (ETH dari escrow) dan reputasi (Soulbound Token) agar status akademik tidak dapat dikomodifikasi.

Empat masalah yang dijawab (Subbab III.2.1, hlm. 35-36):

| Masalah | Isi | Jawaban rancangan |
|---|---|---|
| M1 | Pengukuran kontribusi | q1-q4 dan TOPSIS |
| M2 | Fusi bobot | BWM + ECWM dengan parameter λ |
| M3 | Distribusi non-linear | Sigmoid |
| M4 | Integritas reputasi | SBT non-transferable dengan decay |

Batas lingkup yang dinyatakan laporan:

- Integrasi OJS penuh, penugasan editorial, dan penelaahan buta-ganda berada di luar lingkup (hlm. 83, butir 1).
- Instrumen AI bersifat inference-only (hlm. 4).
- Hasil berlaku pada simulasi terkontrol, bukan operasi nyata (hlm. 111).

## 2. Arsitektur
**Kode dan laporan** (hlm. 53-54, 71-73): tiga lapisan. Komputasi statistik berada di middleware, sedangkan perangkingan dan distribusi berada on-chain.

```text
 Browser (HTML + bundle TS)                     MetaMask
  author / reviewer / editor / public             |  createBatch + ETH
  pipeline / monitor / evaluation / demo          |  (ditandatangani penulis)
        | REST (port 3000)                        |
        v                                         |
 server/index.ts (Express 5)                      |
  - data/demo-store.json: paper, ulasan, snapshot |
  - memanggil middleware dan eval/core            |
  - menandatangani executeDistribution            |
    dengan kunci operator                         |
        |                                         |
 middleware/ (TS murni)                           |
  qos -> normalization -> bwm + ecwm -> fusion    |
  topsis, sigmoid: pratinjau off-chain saja       |
        | matriks ternormalisasi, bobot, mask     |
        v                                         v
 ---------------- batas kepercayaan -------------------
 IncentiveEngine.sol  : escrow, TOPSIS, sigmoid, bagi ETH
        | mint(reviewer, sigmoid)  (pemilik SBT = Engine)
        v
 ReputationSBT.sol    : saldo reputasi + decay
        | effectiveBalance(addr) dibaca sebagai q4 siklus berikutnya
        +--------------------> kembali ke server
```

Batas kepercayaan: kontrak hanya menjamin eksekusi sesuai input, bukan kebenaran input. Laporan mengakui hal ini (hlm. 54). **Kode:** kontrak tidak memeriksa rentang nilai matriks atau jumlah bobot (`contracts/IncentiveEngine.sol:103-119`).

## 3. Teknologi dan komponen
### Versi

| Paket | `package.json` | `package-lock.json` | Peran |
|---|---|---|---|
| hardhat | ^2.22.0 | 2.28.6 | Kompilasi, tes, runtime server |
| @nomicfoundation/hardhat-toolbox | ^5.0.0 | 5.0.0 | Plugin tes dan verifikasi |
| @openzeppelin/contracts | ^5.1.0 | 5.6.1 | `Ownable` |
| express | ^5.2.1 | 5.2.1 | API |
| cors | ^2.8.6 | 2.8.6 | CORS |
| typescript | ^5.4.0 | 5.9.3 | Bahasa |
| ts-node | ^10.9.0 | 10.9.2 | Runtime server dan eval |
| esbuild | ^0.24.2 | 0.24.2 | Bundle frontend |
| dotenv | ^16.6.1 | 16.6.1 | Env |
| @huggingface/transformers (opsional) | ^3.0.0 | 3.8.1 | Embedding q2/q3 |
| pdf-parse (opsional) | ^1.1.1 | 1.1.4 | Ekstraksi PDF |
| ethers (transitif, tidak dideklarasikan langsung) | tidak ada | 6.16.0 | Dipakai server dan frontend |

Solidity 0.8.24, optimizer 200 runs (`hardhat.config.ts:11-16`). Pragma kontrak `^0.8.24`. Laporan menyebut OpenZeppelin 5.1 (hlm. 76), sedangkan lockfile mengunci 5.6.1. Chart.js yang disebut `planning.md:352` tidak ditemukan di `public/`.

### Modul

| Berkas | Fungsi |
|---|---|
| `contracts/IncentiveEngine.sol` | Escrow per batch, TOPSIS, sigmoid, distribusi ETH, pemanggilan mint SBT |
| `contracts/ReputationSBT.sol` | Saldo reputasi tanpa fungsi transfer, dengan decay |
| `middleware/normalization.ts` | Normalisasi min-max |
| `middleware/weighting/bwm.ts` | Bobot subjektif dan Consistency Ratio |
| `middleware/weighting/ecwm.ts` | Bobot objektif Entropy-CRITIC beserta langkah antara |
| `middleware/weighting/fusion.ts` | Fusi linear |
| `middleware/topsis.ts`, `sigmoid.ts` | Referensi off-chain untuk pratinjau dan verifikasi silang |
| `middleware/qos/types.ts` | Antarmuka `QoSProvider`, `ReviewerSubmission`, `QoSRow` |
| `middleware/qos/index.ts` | `createProvider`, `buildQoSMatrix` |
| `middleware/qos/heuristic.ts` | Provider deterministik tanpa model |
| `middleware/qos/localModel.ts` | Provider MiniLM lokal |
| `middleware/qos/abstract.ts` | Ekstraksi abstrak dan judul secara deterministik |
| `server/index.ts` | API, penyimpanan JSON, penandatanganan operator |
| `eval/core.ts` | `runPipeline`, `runBaselines`, `runMulticycle`, metrik |
| `eval/*.ts`, `eval/realdata/*` | Reproduksi evaluasi dan simulasi off-chain |
| `frontend/*.ts`, `public/*.html` | Halaman per peran dan halaman evaluasi |
| `test/` | 23 kasus kontrak, 9 kasus gas (dari loop), 67 kasus middleware (hitungan `it`, tidak dijalankan) |
| `deployments/*.json` | Alamat kontrak per jaringan |

### Endpoint server

| Endpoint | Baris (`server/index.ts`) | Fungsi |
|---|---|---|
| `POST /api/paper` | 125-161 | Ekstraksi abstrak dan judul |
| `POST /api/qos` | 163-182 | Membangun matriks dari teks |
| `POST /api/pipeline`, `/api/scenarios`, `/api/baselines`, `/api/multicycle` | 188-300 | Evaluasi off-chain |
| `POST /api/onchain/deploy`, `/api/onchain/execute` | 316-418 | Siklus lokal Hardhat |
| `POST /api/onchain/attach`, `GET /api/onchain/config`, `GET /api/onchain/params` | 430-494 | Sambungan ke deployment dan konfigurasi |
| `POST /api/onchain/distribute` | 498-548 | Distribusi dengan matriks dari pemanggil |
| `GET /api/onchain/history` | 561-654 | Riwayat batch |
| `POST /api/submission`, `GET /api/submissions`, `GET /api/submission` | 745-777 | Data naskah |
| `GET /api/reviews/pending`, `POST /api/review` | 780-815 | Alur penelaah |
| `POST /api/onchain/distribute-batch`, `POST /api/preview-batch` | 818-921 | Alur editor |
| `POST /api/onchain/reputation`, `GET /api/onchain/audit` | 926-1112 | Baca reputasi dan audit |

**Kode:** tidak ada autentikasi pada semua endpoint ini. CORS terbuka (`server/index.ts:94`).

## 4. Smart contract
### IncentiveEngine (`contracts/IncentiveEngine.sol`)

**State**

| Nama | Tipe | Baris | Keterangan |
|---|---|---|---|
| `PRECISION` | `uint256 constant` | 24 | 1e18 |
| `NUM_CRITERIA` | `uint256 constant` | 25 | 4 |
| `reputationSBT` | `ReputationSBT` | 28 | Kontrak reputasi |
| `sigmoidK`, `sigmoidX0` | `uint256` | 34-35 | Berskala 1e18, global untuk semua batch |
| `Batch.author` | `address` | 39 | `msg.sender` saat `createBatch` |
| `Batch.escrowAmount` | `uint256` | 40 | Tidak dinolkan setelah distribusi |
| `Batch.reviewers` | `address[]` | 41 | Getter `batches` otomatis tidak mengembalikan array ini, dan tidak ada fungsi view khusus |
| `Batch.distributed` | `bool` | 42 | Penanda sekali jalan |
| `Batch.journalName` | `string` | 43 | Teks terbuka |
| `batches` | `mapping(uint256 => Batch)` | 45 | Publik |
| `nextBatchId` | `uint256` | 46 | Penghitung |

**Fungsi**

| Fungsi | Akses | Baris | Perilaku |
|---|---|---|---|
| `constructor(sbt, k, x0)` | `Ownable(msg.sender)` | 53-61 | Deployer menjadi operator |
| `createBatch(reviewers, journalName)` | `external payable`, siapa pun | 72-84 | Menerima ETH dan mendaftarkan 1-10 alamat |
| `executeDistribution(batchId, matrix, weights, participated)` | `onlyOwner` | 103-175 | TOPSIS, gerbang partisipasi, sigmoid, ETH, SBT, refund |
| `_topsis` | `internal pure` | 190-239 | Skor `S_i` |
| `_sigmoid` | `internal view` | 255-277 | Pendekatan sigmoid |
| `_sqrt` | `internal pure` | 286-295 | Akar kuadrat Babilonia |
| `setSigmoidParams(k, x0)` | `onlyOwner` | 301-304 | Tanpa validasi nilai |
| `receive()` | `external payable` | 306 | Menerima ETH lepas tanpa jalur penarikan |

**Event** (baris 49-51):

- `BatchCreated(batchId indexed, author, amount, reviewerCount)`
- `BatchDistributed(batchId indexed, scores[])`
- `RewardDistributed(batchId indexed, reviewer, ethReward, reputationAmount)`

**Error**: semuanya string `require`, kecuali `OwnableUnauthorizedAccount` dari OpenZeppelin (diuji di `test/contracts/IncentiveEngine.test.ts:178`).

| Pesan | Baris |
|---|---|
| `Escrow amount must be > 0` | 73 |
| `1-10 reviewers` | 74 |
| `Already distributed` | 110 |
| `Matrix/reviewer mismatch` | 111 |
| `Participation/reviewer mismatch` | 112 |
| `Each row must have 4 criteria` | 118 |
| `ETH transfer failed` | 156 |
| `Escrow refund failed` | 171 |

### ReputationSBT (`contracts/ReputationSBT.sol`)

**State**

| Nama | Tipe | Baris |
|---|---|---|
| `_balances` | `mapping(address => uint256)` private | 18 |
| `_lastActiveTimestamp` | `mapping(address => uint256)` private | 19 |
| `decayRatePerDay` | `uint256` public, skala 1e18 | 22 |
| `PRECISION` | `uint256 constant` | 23 |

**Fungsi**

| Fungsi | Akses | Baris | Perilaku |
|---|---|---|---|
| `balanceOf(account)` | publik, view | 36-38 | Saldo mentah |
| `effectiveBalance(account)` | publik, view | 45-47 | Saldo setelah decay; sumber q4 |
| `lastActive(account)` | publik, view | 52-54 | Waktu aktivitas terakhir |
| `mint(to, amount)` | `onlyOwner` | 62-72 | Terapkan decay, tambah saldo, reset waktu |
| `triggerDecay(account)` | publik, siapa pun | 78-84 | Terapkan decay, reset waktu |
| `setDecayRate(rate)` | `onlyOwner` | 89-91 | Tidak terjangkau setelah deployment normal |
| `_applyDecay(account)` | internal view | 104-130 | Rumus decay |

**Event** (baris 26-27): `ReputationMinted(reviewer indexed, amount)`, `ReputationDecayed(reviewer indexed, before, after_)`.

**Error**: tidak ada error kustom, hanya error `Ownable`.

Sifat soulbound dicapai dengan tidak adanya fungsi transfer (baris 132-134). Kontrak ini tidak mengikuti ERC-20, ERC-721, atau ERC-5192.

### Alur dana escrow pool

**Sifat pool.** **Kode:** "pool" adalah alokasi logis per batch (`Batch.escrowAmount`), bukan pool bersama. Saldo fisik semua batch bercampur di satu kontrak.

**Siapa membayar dan berapa.**

- `msg.sender` pada `createBatch` membayar `msg.value`, dengan syarat lebih dari 0 (baris 73).
- Tidak ada besaran APC tetap atau minimum.
- Nilai contoh: antarmuka 0,01 ETH (`public/author.html:31`, `frontend/author.ts:40`), evaluasi 2 ETH (`eval/core.ts:109`).
- Kontrak tidak memeriksa bahwa pembayar adalah penulis naskah.

**Kapan masuk.** Saat transaksi `createBatch` berhasil, dan daftar penelaah harus sudah diketahui saat itu. Tidak ada fungsi top-up.

**Bagaimana dibagi.** Operator memanggil `executeDistribution`:

```text
S_i      = _topsis(matrix, weights)                    untuk semua baris, termasuk no-show
sigma_i  = participated[i] ? _sigmoid(S_i) : 0
ETH_i    = floor(escrowAmount * sigma_i / sum(sigma))
SBT_i    = sigma_i
```

- Penandaan `distributed = true` terjadi sebelum transfer (baris 141).
- ETH dikirim dengan `.call` dalam loop (baris 155).
- Mint terjadi per penelaah setelah transfer (baris 160-162).
- Porsi no-show mengalir ke peserta lain, bukan kembali ke penulis (baris 96-101).

**Bila pool kurang.** **Kode:** konsep kekurangan pool tidak ada. Pembagian berbasis proporsi selalu menghabiskan berapa pun isinya, tanpa jaminan imbalan minimum. Konsekuensinya:

- Pool sangat kecil dapat membuat `ETH_i = 0`. Transfer dilewati, tetapi SBT tetap dicetak (baris 154-162).
- Satu transfer gagal membatalkan seluruh transaksi (baris 156). Inferensi: alamat kontrak yang menolak ETH dapat memblokir batch, kecuali operator menandainya `participated = false`.
- Sisa pembulatan paling banyak `n - 1` wei per batch tertahan selamanya (Inferensi dari pembagian floor). Tes hanya mensyaratkan sisa di bawah 0,001 ETH (`test/contracts/IncentiveEngine.test.ts:202`).

**Refund.** **Kode:** satu-satunya jalur ada di baris 169-172, yaitu jika `sigmaSum == 0` dan escrow lebih dari 0, seluruh escrow dikirim ke `batch.author`. Jalur ini hanya berjalan lewat `executeDistribution` oleh operator, sehingga secara praktis harus semua penelaah no-show.

**Tidak ditemukan:**

- Refund yang dipanggil penulis.
- Timeout.
- Pembatalan.
- Refund parsial.
- Kaitan dengan keputusan naskah atau penolakan awal.

Jika operator tidak pernah mengeksekusi, dana terkunci selamanya.

**Risiko tambahan** (Inferensi dari pembacaan kode, belum diuji):

- `executeDistribution` tidak memeriksa batch ada. Operator dapat memanggilnya untuk `batchId` masa depan dengan matriks kosong, sehingga `distributed` menjadi `true`. `createBatch` tidak mereset nilai itu, jadi batch berikutnya dengan ID tersebut akan selalu gagal dengan `Already distributed` dan dananya terkunci.
- Alamat penelaah duplikat, alamat nol, dan penulis sebagai penelaah tidak ditolak (baris 74).
- Dengan satu peserta, peserta itu menerima 100% pool berapa pun skornya.
- `batchId` di sisi klien dihitung sebagai `nextBatchId - 1` (`frontend/author.ts:52`, `server/index.ts:387`), sehingga rentan tertukar bila ada transaksi bersamaan.

**Dua temuan pada reputasi** (Inferensi dari kode, belum diuji):

- **Decay dapat dihindari.** `triggerDecay` mereset waktu aktivitas, sementara `_applyDecay` membulatkan hari ke bawah (`ReputationSBT.sol:81,109,111`). Memanggilnya setiap kurang dari 24 jam mempertahankan saldo tanpa decay.
- **Kepemilikan SBT terkunci.** Setelah kepemilikan dipindah ke Engine, tidak ada fungsi Engine yang memanggil `setDecayRate` atau `transferOwnership`. Ini berbeda dari klaim laporan pada hlm. 69 (λ dapat dikonfigurasi) dan hlm. 79 (SBT dapat dipakai mesin versi berikutnya).

## 5. Alur data
### Penulis (`public/author.html`, `frontend/author.ts`)

1. Menghubungkan MetaMask dan memuat `/api/onchain/config` (`frontend/author.ts:13-24`).
2. Mengunggah PDF. `POST /api/paper` mengekstrak abstrak dan judul (`server/index.ts:125-161`).
3. Mengisi jurnal, alamat penelaah (terisi otomatis dari daftar demo), dan escrow.
4. **On-chain:** menandatangani `createBatch` dengan ETH (`frontend/author.ts:49`).
5. **Off-chain:** `POST /api/submission` menyimpan abstrak dan daftar penelaah ke `data/demo-store.json` (`frontend/author.ts:53`, `server/index.ts:745-758`).

Bila langkah 5 gagal, `reconstructOrphanBatches` memulihkan data dengan mendekode calldata transaksi (`server/index.ts:694-742`). Ini sekaligus membuktikan daftar penelaah terbaca publik dari calldata.

### Penelaah (`public/reviewer.html`, `frontend/reviewer.ts`)

1. Menghubungkan MetaMask, atau memilih mode "act as" tanpa tanda tangan (`frontend/reviewer.ts:79-85`).
2. `GET /api/reviews/pending` dan `GET /api/submission` menampilkan abstrak.
3. `POST /api/review` berisi `batchId`, `reviewer`, `reviewText`, dan `daysElapsed` opsional (`frontend/reviewer.ts:51`).
4. Server menghitung q2 dan q3 dengan provider, menentukan q1, lalu menyimpan ke JSON (`server/index.ts:801-812`). Skor tidak dikembalikan (baris 813).

Tidak ada transaksi on-chain pada peran ini. Identitas penelaah hanya berupa string di body request. Ulasan dapat dikirim ulang dan menimpa yang lama (baris 811).

### Editor (`public/editor.html`, `frontend/editor.ts`)

1. Memilih preset BWM atau input manual, dan λ dengan slider 0,3-0,7 (`public/editor.html:32`).
2. Pratinjau lewat `POST /api/preview-batch` menampilkan alamat penelaah, q1-q4, bobot, dan skor (`server/index.ts:884-921`, `frontend/editor.ts:88-123`).
3. `POST /api/onchain/distribute-batch` memicu langkah berikut (`server/index.ts:818-880`):
   - `buildBatchMatrix` menggabungkan q1-q3 tersimpan dengan q4 dari `effectiveBalance`.
   - Server menormalkan, menghitung BWM dan ECWM, menggabungkan bobot.
   - Nilai dikonversi ke 1e18, dan mask partisipasi diambil dari status ulasan.
4. **On-chain:** server menandatangani `executeDistribution` dengan kunci operator (baris 849).
5. Hasil event dan derivasi bobot disimpan sebagai snapshot off-chain (baris 863-876).

Tombol distribusi aktif jika ada minimal 1 ulasan (`frontend/editor.ts:73`). Server mensyaratkan minimal 2 penelaah terdaftar (`server/index.ts:828-831`). Editor tidak menandatangani apa pun.

### Publik (`public/public.html`, `frontend/public-view.ts`)

Membaca `/api/onchain/history`, `/api/submissions`, dan `/api/onchain/reputation` untuk menampilkan skor, ETH, serta saldo SBT per alamat (`frontend/public-view.ts:26-77`).

### Mode lokal (`public/monitor.html`, `public/pipeline.html`)

Deploy lewat `/api/onchain/deploy`, pipeline lewat `/api/pipeline`, lalu `/api/onchain/execute` membuat batch dan mendistribusikannya sekaligus memakai signer Hardhat (`server/index.ts:355-418`). Tidak memakai MetaMask.

## 6. Mekanisme insentif
### Kriteria QoS

Urutan kolom: `[q1, q2, q3, q4]`, tipe `["cost", "benefit", "benefit", "benefit"]` (`eval/core.ts:26`).

| Var | Kode | Laporan | Perbedaan |
|---|---|---|---|
| q1 | Hari sejak batch dibuat, atau `daysElapsed` dari klien (`server/index.ts:806-809`). No-show diberi 30 (baris 682) | `t_deadline - t_submit`, negatif berarti terlambat (hlm. 55, 138) | Rumus laporan bersifat benefit tetapi digolongkan cost. Kode konsisten sebagai cost. Tenggat 14 hari tidak memengaruhi nilai |
| q2 | `provider.relevance(reviewText, paperText)` (`server/index.ts:802`) | Kosinus embedding ulasan dan paper (hlm. 55, 78) | Provider heuristik memakai kosinus frekuensi kata |
| q3 | `provider.actionability(reviewText)` (`server/index.ts:803`) | `n_saran / n_total` (hlm. 55) | Sama secara konsep |
| q4 | `effectiveBalance(addr)` (`server/index.ts:675`) | `SBT × e^(-λt)` (hlm. 55) dan `SBT × (1-λ)^t` (hlm. 138) | Kode memakai bentuk diskret |

**q2 dan q3 dihitung dari:**

- **Masukan q2:** teks ulasan dan abstrak paper. Abstrak diekstrak oleh `extractAbstract(fullText)` dengan batas 3000 karakter (`middleware/qos/abstract.ts:17,19-48`).
- **Masukan q3:** teks ulasan saja, dipecah dengan regex `/[.!?]+/`.

| Provider | q2 | q3 | Baris |
|---|---|---|---|
| `LocalModelProvider` (`Xenova/all-MiniLM-L6-v2`) | `clamp01(cosine(embed(review), embed(paper)))` | Proporsi kalimat dengan `cos(e, centroidAksi) >= cos(e, centroidNonAksi)`, dari 4 + 4 contoh bahasa Inggris | `localModel.ts:24,27-38,74-91` |
| `HeuristicProvider` | Kosinus vektor frekuensi kata (`[a-z]+`, panjang > 2, tanpa stopword) | Proporsi kalimat yang cocok `ACTION_MARKERS` atau `REFERENCE_MARKERS` | `heuristic.ts:25-29,34-43,46-81` |

### Normalisasi

`normalize(matrix, types)`: masukan matriks mentah n×m dan tipe kriteria; keluaran matriks n×m dalam [0,1] (`middleware/normalization.ts:21-65`).

```text
benefit: r_ij = (x_ij - min_j) / (max_j - min_j)
cost:    r_ij = (max_j - x_ij) / (max_j - min_j)
max_j == min_j: r_ij = 0.5
```

Inferensi: selisih q4 yang sangat kecil tetap menjadi rentang penuh 0-1, dan skor selalu relatif terhadap batch (diakui laporan, hlm. 57, 97).

### BWM

`computeBWM({bestIndex, worstIndex, bestToOthers, othersToWorst})`: keluaran `{weights, consistencyRatio}` (`middleware/weighting/bwm.ts:55-120`).

```text
w_j = (1 / a_Bj) / sum_k(1 / a_Bk)
CR  = max_j( abs(w_B/w_j - a_Bj), abs(w_j/w_W - a_jW) ) / CI(a_BW)
CI  = {1:0, 2:0.44, 3:1.0, 4:1.63, 5:2.3, 6:3.0, 7:3.73, 8:4.47, 9:5.23}
```

**Perbedaan:** laporan menyajikan model optimasi min-max Rezaei (hlm. 17), sedangkan kode memakai pendekatan tertutup dari `bestToOthers` saja. `othersToWorst` hanya memengaruhi CR.

**Preset tidak seragam (Kode):**

| Preset | `server/index.ts:77-81` (Best-to-Others) | `frontend/config/eval-datasets.ts:35-39` | `frontend/pipeline.ts:5-9` |
|---|---|---|---|
| Balanced | [2,2,1,4] | [2,2,1,4] | [1,1,1,2] |
| Actionability-First | [8,4,1,2] | [6,2,1,3] | [6,2,1,3] |
| Speed-First | [1,3,3,6] | [1,2,3,6] | [1,2,3,6] |
| Depth/Relevance-First | [8,1,2,4] | [6,1,2,3] | [6,1,2,3] |
| Reputation-First | [8,4,2,1] | [6,3,2,1] | [6,3,2,1] |

`test/contracts/gas.test.ts:19` dan `planning.md:238` memakai vektor lain lagi, yaitu [3,2,1,5]. Preset "Rep-aware" (q4 = 0,40) hanya ada di `eval/realdata/metric-gaming.ts:40`. Laporan menamai preset "Depth-First" (hlm. 140) sekaligus "Relevance-First" (hlm. 128).

### ECWM (pembobotan adaptif)

Masukan: matriks ternormalisasi dan `gamma`. Keluaran: bobot, atau rincian lengkap lewat `computeECWMDetail` (`middleware/weighting/ecwm.ts:49-83,136-169,202-211`).

```text
Entropy: p_ij = r_ij / sum_i(r_ij)
         e_j  = -(1/ln n) * sum_i(p_ij * ln p_ij)
         d_j  = 1 - e_j
         ew_j = d_j / sum(d)
CRITIC:  sigma_j = simpangan baku populasi kolom j
         rho_jk  = korelasi Pearson (0 bila penyebut 0)
         C_j  = sigma_j * sum_k(1 - rho_jk)
         cw_j = C_j / sum(C)
ECWM:    Wobj_j = gamma * ew_j + (1 - gamma) * cw_j      gamma default 0.5
```

Kolom seragam menghasilkan bobot objektif 0. Inilah sifat adaptif yang diuji laporan (hlm. 96-97, `eval/ecwm-adaptive.ts`).

**Perbedaan:**

- Persamaan II.7 memuat faktor 1/2 (hlm. 20). Kode dan Lampiran F (hlm. 138) tidak memakainya.
- Entropy dihitung atas `r_ij`, sedangkan Persamaan II.3 ditulis atas `x_ij`.

### Fusi

`fuseWeights(sub, obj, lambda)` (`middleware/weighting/fusion.ts:20-36`), `lambda` di luar [0,1] ditolak:

```text
W_j = lambda * Wsub_j + (1 - lambda) * Wobj_j       default lambda = 0.6
```

Sebelum dikirim on-chain: `w / sum(w)`, lalu `parseEther(toFixed(18))` (`server/index.ts:842-845`).

### TOPSIS

- Off-chain: `topsis(normalizedMatrix, weights, types)` mengembalikan `{scores, ranking}` (`middleware/topsis.ts:31-83`).
- On-chain: `_topsis` mengembalikan `scores` berskala 1e18 (`contracts/IncentiveEngine.sol:190-239`).

```text
V_ij = r_ij * W_j                    on-chain: floor(r_ij * W_j / 1e18)
PIS_j = max_i V_ij ; NIS_j = min_i V_ij
D+_i = sqrt(sum_j (V_ij - PIS_j)^2)
D-_i = sqrt(sum_j (V_ij - NIS_j)^2)
S_i  = D-_i / (D+_i + D-_i)          0.5 bila penyebut 0
```

Parameter `types` tidak dipakai di dalam fungsi off-chain, karena arah cost sudah dibalik saat normalisasi.

### VIKOR

**Kode:** hanya simulasi off-chain (`eval/vikor-sensitivity.ts:39-68`), dengan `v` dalam {0; 0,25; 0,5; 0,75; 1} (baris 102):

```text
S_i = sum_j w_j * (f*_j - r_ij) / (f*_j - f-_j)
R_i = max_j [ w_j * (f*_j - r_ij) / (f*_j - f-_j) ]
Q_i = v * (S_i - S*) / (S- - S*) + (1 - v) * (R_i - R*) / (R- - R*)
```

**Laporan bertentangan:** hlm. 95 menyatakan VIKOR diimplementasikan off-chain, sedangkan hlm. 110 dan 113 menyatakan belum.

### Sigmoid

**Off-chain** `sigmoid(score, {k, x0})` dan `distribute(scores, pool, params)` (`middleware/sigmoid.ts:35-38,49-64`):

```text
f(S) = 1 / (1 + e^(-k * (S - x0)))       k = 10, x0 = 0.5
share_i = f_i / sum(f) ; reward_i = share_i * pool
```

**On-chain** `_sigmoid(score)` (`contracts/IncentiveEngine.sol:255-277`) bukan fungsi logistik:

```text
x = (S - x0) * k        dalam skala 1e18
x > 10  -> 1
x < -10 -> 0
x >= 0  -> 0.5 + 0.5 * x / (x + 1)
x < 0   -> 0.5 - 0.5 * abs(x) / (abs(x) + 1)
```

Komentar kode menyebut "cubic" dan "piecewise linear" (baris 248-250, 265-267), keduanya tidak tepat. `planning.md:332` mencatat rumus yang benar. Laporan hanya menyebut "aproksimasi sigmoid tersaturasi" (hlm. 125).

**Inferensi, hasil hitungan replikasi saya** (belum dijalankan di EVM):

| Besaran | Logistik off-chain (angka laporan) | Rumus on-chain |
|---|---|---|
| Nilai pada S = 0 / S = 1 | 0,0067 / 0,9933 | 0,0833 / 0,9167 |
| Rasio honest terhadap free-rider, D2 | 2,79× | sekitar 2,59× |
| ROI Sybil, D3 | sekitar 0,07× | sekitar 0,41× |
| Imbalan R1 pada D1 | 0,7056 ETH | 0,6453 ETH (sama dengan Lampiran B) |

Jadi ROI Sybil 0,07 di abstrak dan kesimpulan belum mewakili distribusi yang benar-benar dijalankan kontrak.

Laporan juga menyatakan kedua free-rider memperoleh imbalan terkecil (hlm. 98). Tabel yang sama (Tabel VI.14) menunjukkan Free-rider-1 mendapat 0,1640, lebih besar dari Honest-D (0,1435) dan Honest-F (0,1149).

### Gerbang partisipasi

**Kode:** `participated[i] == false` berarti `sigma_i = 0`, sehingga 0 ETH dan 0 SBT (`contracts/IncentiveEngine.sol:131-138`).

Baris no-show tetap ikut normalisasi dan ECWM dengan nilai `[30, 0, 0, q4]` (`server/index.ts:682`). Inferensi: baris ini mengubah skor peserta. Dalam contoh hitungan saya dengan dua peserta, skor peserta terlemah naik dari 0 menjadi 0,757 hanya karena ada satu baris no-show.

### SBT, decay, dan penalti keterlambatan

**Mint:** `SBT_i = sigma_i` (`contracts/IncentiveEngine.sol:151,160-162`).

**Decay** (`contracts/ReputationSBT.sol:104-130`):

```text
daysInactive = floor(elapsed / 1 days)
factor = (1 - decayRatePerDay)^daysInactive     exponentiation by squaring
B_eff  = B * factor                             decayRatePerDay default 0.02
waktu paruh = ln(0.5) / ln(0.98) = 34,3 hari
```

Laporan memilih model ini (hlm. 69-71).

**Inferensi, perbedaan simulasi dan kontrak:** `runMulticycle` hanya meluruhkan Eve pada siklus 4, 7, dan 10, sedangkan penelaah aktif tidak meluruh (`eval/core.ts:235-242`). Di kontrak, "inaktif" berarti waktu sejak mint terakhir. Dengan jarak 30 hari, penelaah aktif pun kehilangan sekitar 45% saldo tiap siklus, karena 0,98^30 ≈ 0,545. Pertumbuhan Alice dari 0,99 ke 9,93 (Tabel VI.16, hlm. 101) tidak akan terjadi on-chain dengan jarak itu; saldonya mendekati sekitar 2,2.

**Penalti keterlambatan:** hanya simulasi dan ditolak laporan (hlm. 71). Tidak ada di kontrak (`eval/late-penalty.ts:32-37,74-77`):

```text
q1 = lateOn(c) ? 20 : 4
sbt += sigma
jika terlambat: sbt *= (1 - 0.20)          sweep penalti 0.10, 0.20, 0.40
```

### Sliding window

**Kode:** hanya simulasi (`eval/sliding-window-compare.ts:21-22,40,63`): `q4 = jumlah sigma pada W siklus terakhir`, `W = 5`, siklus inaktif menyumbang 0. Laporan mencatat paritas pendatang tercapai pada siklus ke-5 (hlm. 131) dan menjadikannya pengembangan lanjutan.

### Cold start

**Kode:** tidak ada bootstrapping on-chain. Akun baru memiliki q4 = 0. Bila semua q4 sama, kolom menjadi 0,5 dan bobot objektifnya 0.

**Simulasi** `eval/cold-start.ts:24-29,47`: Veteran-Baik `initSbt = 8`, Pendatang-Baik `initSbt = 0`.

**Laporan** (hlm. 130-131): preset Balanced memberi pendatang 86% imbalan veteran pada siklus 1, dan Reputation-First 28%.

### Nilai default

| Parameter | Nilai | Bukti |
|---|---|---|
| λ | 0,6 (rentang operasional 0,3-0,7) | `eval/core.ts:106`, `public/editor.html:32`, laporan hlm. 61 |
| γ, β | 0,5 / 0,5 | `middleware/weighting/ecwm.ts:193,208` |
| k, x0 | 10, 0,5 | `server/index.ts:328-329`, `eval/deploy-sepolia.ts:35` |
| λdecay | 0,02 per hari | `server/index.ts:322` |
| Pool evaluasi | 2 ETH | `eval/core.ts:109` |
| Tenggat | 14 hari, hanya informasi | `server/index.ts:68` |
| Jumlah penelaah | 1-10 on-chain, minimal 2 di server | `contracts/IncentiveEngine.sol:74`, `server/index.ts:828` |

### Antarmuka minimum simulator QoS pengganti LLM

**Kode** (`middleware/qos/types.ts:25-32`):

```ts
export interface QoSProvider {
  readonly name: string;
  relevance(reviewText: string, paperText: string): Promise<number>; // q2, [0,1]
  actionability(reviewText: string): Promise<number>;                // q3, [0,1]
}
```

Syarat yang tersirat dari pemakai antarmuka (Inferensi, kecuali yang diberi bukti):

- Mengembalikan angka hingga dalam [0,1]. Hanya `distribute-batch` yang menyaring NaN (`server/index.ts:840-845`); `/api/onchain/distribute` tidak.
- Deterministik untuk masukan yang sama (NFR-02, diuji di `test/middleware/qos.test.ts:50-59`).
- Teks kosong menghasilkan q3 = 0 (`test/middleware/qos.test.ts:45-47`), dan `paperText` boleh kosong (`server/index.ts:802`).
- Hanya posisi relatif dalam batch yang penting, karena ada min-max. Skala absolut tidak perlu meniru embedding.
- Nilai perlu bervariasi antar penelaah. Kolom seragam membuat kriteria itu tidak berpengaruh.
- Skor tidak dikembalikan ke penelaah (`server/index.ts:813`).

**Kesiapan.** `HeuristicProvider` sudah memenuhi antarmuka ini tanpa LLM, dan dapat dipaksa dengan `QOS_PROVIDER=heuristic` (`middleware/qos/index.ts:31-34`).

**Keterbatasan bahasa:** regexnya hanya berbahasa Inggris. Pengujian regex saya atas enam contoh di `frontend/reviewer.ts:58-65` menghasilkan 0/5, 0/2, 0/3, 0/3, 0/1, dan 0/1 kalimat. Simulator perlu penanda bahasa Indonesia, atau demo harus memakai teks Inggris.

**Data acuan:** `eval/realdata/peerread-iclr2017-derived.json` memuat q2 dan q3 dari 600 ulasan nyata, dapat dipakai untuk mengkalibrasi sebaran simulator.

## 7. Terimplementasi di kode vs hanya di laporan
| Fitur | Di laporan? | Di kode? | Bukti | Catatan |
|---|---|---|---|---|
| Normalisasi min-max | Ya, hlm. 56 | Ya | `middleware/normalization.ts:21-65` | Kasus kolom seragam tidak dibahas laporan |
| BWM optimasi min-max | Ya, hlm. 17 | Sebagian | `middleware/weighting/bwm.ts:89-96` | Memakai pendekatan tertutup |
| Lima preset BWM | Ya, hlm. 140 | Ya, tidak seragam | `server/index.ts:77-81`, `frontend/config/eval-datasets.ts:35-39` | Angka evaluasi memakai vektor yang berbeda dari server |
| ECWM dan fusi | Ya, hlm. 58-61 | Ya | `ecwm.ts:202-211`, `fusion.ts:20-36` | Faktor 1/2 pada II.7 tidak ada di kode |
| TOPSIS on-chain | Ya, hlm. 65 | Ya | `contracts/IncentiveEngine.sol:190-239` | |
| Sigmoid logistik on-chain | Ya, hlm. 68, 81 | Tidak persis | `contracts/IncentiveEngine.sol:268-276` | Fungsi rasional; lantai lebih tinggi |
| VIKOR | Bertentangan, hlm. 95 dan 110 | Hanya simulasi | `eval/vikor-sensitivity.ts:39-68` | |
| Gerbang partisipasi | Ya, hlm. 83 | Ya | `contracts/IncentiveEngine.sol:131-138` | Tabel E.1 (hlm. 136) tidak mencantumkan parameter `participated` |
| Refund bila semua no-show | Ya, hlm. 83 | Ya | `contracts/IncentiveEngine.sol:169-172` | Hanya lewat operator |
| Refund oleh penulis atau timeout | Tidak | Tidak ditemukan | - | Celah penting |
| Penugasan penelaah oleh editor | Di luar lingkup, hlm. 83 | Tidak | `frontend/author.ts:41,49` | Penulis yang memilih |
| Buta-ganda atau triple-blind | Di luar lingkup, hlm. 83 | Tidak | `server/index.ts:763-767` | Daftar penelaah terbuka |
| Validasi skor oleh editor (UC3) | Direncanakan, hlm. 50; belum, hlm. 83 | Tidak | - | Skor diterima otomatis |
| q2/q3 berbasis model | Ya, hlm. 78 | Ya, opsional | `middleware/qos/localModel.ts:74-91` | |
| Fallback heuristik | Ya, hlm. 78 | Ya | `middleware/qos/heuristic.ts:31-44` | Hanya bahasa Inggris |
| q1 dari timestamp | Ya, hlm. 55 | Sebagian | `server/index.ts:806-809` | Klien dapat mengirim nilainya sendiri |
| Penegakan tenggat | Di luar lingkup, hlm. 83 | Tidak | `server/index.ts:66-68` | Hanya tampilan |
| q4 dari SBT | Ya, hlm. 79 | Ya | `server/index.ts:674-676` | |
| Decay reputasi | Ya, hlm. 69 | Ya, dapat dihindari | `contracts/ReputationSBT.sol:78-84,104-130` | Lihat Bagian 4 |
| λdecay dapat dikonfigurasi | Ya, hlm. 69 | Tidak terjangkau | `contracts/ReputationSBT.sol:89-91` | Owner adalah Engine |
| k dan x0 per jurnal | Ya, hlm. 69 | Tidak | `contracts/IncentiveEngine.sol:34-35,301-304` | Global; tidak ada endpoint |
| SBT dipakai ulang mesin baru | Ya, hlm. 79 | Tidak | `contracts/IncentiveEngine.sol` (tidak ada fungsi pemindahan owner) | |
| Non-transferable | Ya, hlm. 100 | Ya | `contracts/ReputationSBT.sol:132-134` | Tanpa standar token |
| Uji transfer ditolak | Ya, Tabel VI.1 hlm. 88 | Tidak | `test/contracts/IncentiveEngine.test.ts` | Tidak ada fungsi yang bisa diuji |
| Pembatasan slot oleh editor (lapisan Sybil 3) | Ya, hlm. 100 | Tidak | `contracts/IncentiveEngine.sol:72-74` | `createBatch` publik |
| Sliding window | Simulasi, hlm. 131 | Simulasi | `eval/sliding-window-compare.ts` | |
| Penalti keterlambatan | Ditolak, hlm. 71 | Simulasi | `eval/late-penalty.ts` | |
| Cold start | Ya, hlm. 130 | Simulasi | `eval/cold-start.ts` | |
| Metric gaming | Ya, hlm. 132 | Skrip ada | `eval/realdata/metric-gaming.ts` | Butuh korpus mentah yang tidak ada di repo |
| Event merekam masukan | Ya, hlm. 54 | Sebagian | `contracts/IncentiveEngine.sol:49-51` | Masukan hanya ada di calldata |
| Snapshot derivasi bobot | Ya, hlm. 84 | Ya | `server/index.ts:863-876` | Off-chain |
| Provenance hash on-chain | Pengembangan lanjutan, hlm. 54 | Tidak | - | |
| Deployment Sepolia | Ya, hlm. 107 | Catatan cocok | `deployments/sepolia.json` | Tidak saya periksa on-chain |
| Biaya gas | Ya, hlm. 105 | Ya | `test/contracts/gas.test.ts` | Tidak dijalankan |
| Konektor OJS | Di luar lingkup | Tidak ditemukan | - | Nama saja |
| Autentikasi API | Tidak | Tidak | `server/index.ts:792-815` | |
| `ReviewToken` ERC-20 | Tidak | Tidak | `planning.md:149`, `docs/diagram-class.md` | Dokumen usang |

**Di-mock atau di-hardcode (Kode):**

- Daftar empat penelaah demo: `server/index.ts:62-64`.
- Mode "act as": `frontend/reviewer.ts:79-85`.
- Contoh ulasan: `frontend/reviewer.ts:58-65`.
- `DEMO_MATRIX` dan penerima acak: `frontend/demo.ts:14-19,76`.
- Baris no-show `[30, 0, 0, q4]`: `server/index.ts:682`.
- `k` dan `x0` tetap di pratinjau `/execute`: `server/index.ts:372`.
- Skenario S1-S5 dengan skala q2 lama: `server/index.ts:201-237`.
- RPC Sepolia publik: `server/index.ts:581-584,712`.

Inferensi tentang RPC: `/api/onchain/history` di jaringan lokal akan bertanya ke Sepolia dan dapat mengembalikan log kosong tanpa galat.

**TODO:** penanda `TODO`, `FIXME`, `mock`, dan `stub` tidak ditemukan di kode sumber.

**Dokumen usang:**

| Berkas | Isi usang | Keadaan sekarang |
|---|---|---|
| `docs/diagrams.md`, `docs/diagram-*.md` | q2 = depth, q3 = accuracy dari editor, `ReviewToken` | q2 relevansi, q3 actionability, tanpa ERC-20 |
| `eval/README.md:29-33` | Rasio 2,86×, ROI 0,03×, pemenang R4, 500/500 | `eval-output/eval-results.json`: 2,785×, pemenang R1, 477/500 |
| Tabel C.2 laporan (hlm. 127) | Nomor subbab pemetaan skrip | Tidak cocok dengan penomoran akhir Bab VI |
| `planning.md` | 21 tes kontrak, 53 tes middleware, folder `scripts/` | 23 dan 67 kasus, tanpa `scripts/` |

`README.md` hanya berisi judul.

## 8. Cara menjalankan
**SELURUH BAGIAN INI HASIL BACA KODE, BUKAN HASIL DIJALANKAN.** Di repo tidak ada `node_modules/`, `public/js/`, maupun `data/`. Versi Node yang disyaratkan tidak ditemukan.

```bash
cd /home/ihaidar/Projects/DecPub-claude/Hugo/ojs-incentive-main
npm install
npm run compile
npm test                     # semua tes, termasuk gas
npm run test:middleware
npm run test:contracts
npm run eval                 # menulis ulang eval-output/eval-results.json
npm run eval:verify
npm run eval:gas
npm run eval:all
npm run build:web            # wajib sebelum membuka halaman web
```

**Server dan port.** Port bawaan 3000, dapat diganti dengan `PORT` (`server/index.ts:1118`).

```bash
npm run server               # Hardhat in-process
npm run server:sepolia       # Sepolia; butuh .env
```

- **Mode lokal:** buka `http://localhost:3000/monitor.html`, tekan Deploy, lalu buka `/pipeline.html`.
- **Mode Sepolia:** buka `/sepolia.html`, lalu halaman penulis, penelaah, editor, dan publik.

**Skrip tambahan:**

```bash
npx hardhat run eval/onchain-cycle.ts
npx ts-node eval/worked-example.ts
npx ts-node eval/cold-start.ts
npx ts-node eval/sliding-window-compare.ts
npx ts-node eval/late-penalty.ts
npx ts-node eval/vikor-sensitivity.ts
npx ts-node eval/batch-sensitivity.ts
```

**Deploy (membelanjakan ETH testnet dan menimpa berkas deployment):**

```bash
npm run deploy:sepolia           # deploy + satu siklus, menimpa deployments/sepolia.json
npm run deploy:sepolia:persist   # deploy saja, juga menimpa berkas itu
```

**Env:**

| Variabel | Wajib untuk | Sumber |
|---|---|---|
| `SEPOLIA_RPC_URL`, `PRIVATE_KEY` | Sepolia | `.env.example:5,9` |
| `ESCROW_ETH` | Opsional, default 0,01 | `.env.example:12` |
| `ETHERSCAN_API_KEY` | Verifikasi source | `.env.example:15` |
| `DEMO_REVIEWERS` | Opsional | `.env.example:20` |
| `DEFAULT_DEADLINE_DAYS` | Opsional, default 14 | `server/index.ts:68` (tidak ada di `.env.example`) |
| `PORT` | Opsional | `server/index.ts:1118` |
| `QOS_PROVIDER` | `auto`, `local`, atau `heuristic` | `middleware/qos/index.ts:32` |
| `HARDHAT_NETWORK`, `NETWORK` | Pemilihan jaringan | `server/index.ts:55-57` |

**Hal yang perlu diantisipasi (Inferensi):**

- Kontrak di `deployments/sepolia.json` dimiliki operator `0x4754...7DDc`. Tanpa kunci itu `executeDistribution` akan gagal, jadi perlu deploy sendiri.
- Halaman penulis butuh MetaMask, dan MetaMask tidak dapat menjangkau Hardhat in-process. Mode lokal untuk alur per peran perlu `npx hardhat node`, `HARDHAT_NETWORK=localhost`, dan `deployments/localhost.json`. Langkah ini tidak didokumentasikan repo.
- Status chain in-process hilang saat server dimatikan, sedangkan `data/demo-store.json` tetap ada, sehingga keduanya dapat tidak sinkron.
- `QOS_PROVIDER=auto` mencoba memuat model dan dapat mengunduhnya. Gunakan `heuristic` untuk demo tanpa LLM.

## 9. Tumpang tindih dan bentrok dengan Ciko dan Roihan
Pada bagian ini, kontrak Ciko berada di `Ciko/Anonymize-Publication-main/contracts/contracts/` dan kontrak Roihan di `Roihan/Publication_System_DLT-main/smartcontract/contracts/`. Rujukan hanya menyebut nama berkas. Pembacaan Ciko dan Roihan bersifat seperlunya, bukan audit penuh.

### Perbandingan

| Aspek | Hugo | Ciko | Roihan |
|---|---|---|---|
| Model naskah on-chain | `Batch`: penulis, escrow, penelaah, nama jurnal. Tanpa hash atau status naskah | `PublicationSession`: `bytes32 sessionId`, pseudonim penulis, hash, URI, status (`IPublicationSessions`, `PublicationSessions.sol:62-76`) | `Manuscript`: `uint256 id`, alamat penulis, CID, status, penelaah, DOI (`PublicationRegistry.sol:97-112`) |
| Siklus naskah | Tidak ada | Status lengkap, revisi, zona abu-abu (`PublicationSessions.sol:224-264`) | 8 status, keputusan mayoritas (`PublicationRegistry.sol:78-89,480-498`) |
| Identitas penelaah | Alamat tetap dan publik | Pseudonim per sesi, seleksi berupa komitmen (`ReviewerSelections.sol:43-102`) | Alamat tetap dan publik (`PublicationRegistry.sol:163,461-466`) |
| Pemilih penelaah | Penulis | Sistem, acak menurut kriteria (laporan Ciko hlm. 78-79) | Oracle dengan registri tetap (`oracle/src/reviewer.js`) |
| Jumlah penelaah | 1-10; server minimal 2 | Minimal 1 (`ReviewerSelections.sol:50`) | Ganjil, minimal 3 (`ReviewOracle.sol:121`) |
| Pengiriman ulasan | Off-chain, tanpa tanda tangan | Commit-reveal lewat server (`ReviewSubmissions.sol:73-164`) | EIP-712 lewat operator (`PublicationRegistry.sol:310-350`) |
| Rekomendasi | Tidak ada | Reject, Major, Minor, AcceptAsIs | ACCEPT, REJECT, REVISE |
| Imbalan | Proporsi kualitas dari escrow ETH | Tidak ditemukan; di luar lingkup (laporan Ciko Subbab I.4) | Tetap 10 JRT per penelaah dari biaya 100 JRT setelah diterima (`PublicationRegistry.sol:132-133,385-429`) |
| Token | ETH dan SBT internal | Tidak ada | ERC-20 JRT, ERC-721 DOI |
| Solidity | 0.8.24 | 0.8.28, profil produksi viaIR | 0.8.24, viaIR, cancun |
| Hardhat | 2.x, ethers v6, TypeChain, mocha/chai, CJS | 3.x, viem, Ignition, `node:test`, ESM | 2.x, toolbox ^6.1.2, upgrades, JS |
| Pola akses | `Ownable` | Admin dan session manager kustom, tanpa impor OpenZeppelin | AccessControl, UUPS |
| Siapa menandatangani | Penulis (`createBatch`), operator | Server session manager | Pengguna via EIP-712; operator me-relay; penulis membayar sendiri |
| Backend | Express 5, JSON | NestJS, viem | Go, Gin, PostgreSQL, Pinata |
| Frontend | HTML dan TS bundle | Tidak ditemukan folder frontend | Next.js 16, React 19, wagmi |

**Tumpang tindih:**

- Hugo dan Roihan sama-sama punya distribusi insentif. Keputusan pengguna: mekanisme Hugo yang dipakai, jadi `REVIEWER_INCENTIVE` Roihan digantikan.
- Roihan membayar setelah diterima, sedangkan pengguna meminta bayar di muka seperti APC.
- `payPublicationFee` Roihan juga memicu mint DOI, sehingga pemicu DOI perlu dipisahkan.
- Ketiganya memuat konsep penelaah dan penulis yang berbeda; Ciko menjadi acuan.

### Benturan insentif dengan anonimitas Ciko

**Kebutuhan identitas per kriteria (Inferensi):**

| Kriteria | Butuh identitas lintas sesi? | Sumber dalam alur Ciko |
|---|---|---|
| q1 | Tidak | `committedAt` (`ReviewSubmissions.sol:109`) dan `recordedAt` seleksi (`ReviewerSelections.sol:71`). Menggantikan `daysElapsed` dari klien |
| q2 | Tidak | Teks ulasan dari `reviewURI` dan abstrak anonim dari `anonymizedManuscriptURI`, setelah reveal |
| q3 | Tidak | Teks ulasan dari `reviewURI` |
| q4 | **Ya** | Riwayat penelaah lintas sesi, sedangkan Ciko melarang keterkaitan itu (laporan Ciko hlm. 66, 79) |

**Jalur kebocoran bila kode Hugo dipakai apa adanya:**

| No | Jalur | Bukti | Akibat |
|---|---|---|---|
| 1 | Satu calldata memuat alamat penulis, penelaah, dan nama jurnal | `contracts/IncentiveEngine.sol:72`, `server/index.ts:728-732` | Membuka hubungan penulis dan penelaah |
| 2 | Penulis memilih penelaah | `frontend/author.ts:41` | Melanggar F13 Ciko |
| 3 | Penulis membayar dari dompetnya | `contracts/IncentiveEngine.sol:78-79` | Dompet penulis terkait batch, sementara penulisan Ciko lewat server |
| 4 | q4 dibaca per alamat tetap | `server/index.ts:675` | Pseudonim baru selalu q4 = 0; alamat permanen membuka identitas |
| 5 | Mint ke alamat permanen memakai nilai persis `sigma_i` | `contracts/IncentiveEngine.sol:151,164`, `ReputationSBT.sol:71` | Inferensi: nilai 18 desimal menjadi sidik jari pseudonim dan alamat permanen |
| 6 | q4 ternormalisasi ada di calldata | `contracts/IncentiveEngine.sol:105` | Inferensi: pola q4 dapat dicocokkan dengan saldo SBT publik |
| 7 | Editor melihat alamat dan q4 penelaah | `server/index.ts:910`, `frontend/editor.ts:111-115` | Jalur B06 Ciko terbuka, dan q4 tinggi menandakan penelaah senior |
| 8 | API terbuka menampilkan penelaah | `server/index.ts:763-767` | Siapa pun dapat membaca |
| 9 | Judul diambil dari PDF asli | `middleware/qos/abstract.ts:59-79`, `frontend/author.ts:30-31` | Dilakukan sebelum penghapusan identitas |
| 10 | Waktu mint dan `lastActive` publik | `contracts/ReputationSBT.sol:52-54,69` | Inferensi: waktu aktivitas dapat dikorelasikan dengan penyelesaian sesi |

**Masalah pada kode Ciko yang memengaruhi desain ini (Inferensi dari kode, perlu dikonfirmasi saat analisis Ciko):**

- `createEphemeral` mensyaratkan komitmen sudah terdaftar di `PermanentAccounts` dan belum pernah dipakai secara global (`EphemeralAccounts.sol:53-55,72`). Diuji di `contracts/test/EphemeralAccounts.test.ts:106-117`.
- Satu alamat permanen hanya punya satu komitmen (`PermanentAccounts.sol:74-75`). Artinya satu akun hanya bisa memperoleh satu pseudonim seumur hidup, sehingga reputasi multi-siklus tidak tercapai tanpa perubahan.
- Event `EphemeralAccountCreated` memuat `identityCommitment` (`EphemeralAccounts.sol:76-82`), dan `PermanentAccountRegistered` memetakan komitmen itu ke alamat (`PermanentAccounts.sol:85`). Pseudonim dan akun permanen dapat dikaitkan dari data publik, bertentangan dengan laporan Ciko hlm. 66.

**Benturan alur dana (Inferensi):**

- **Urutan.** Hugo butuh penelaah saat deposit. Ciko baru memilihnya pada P06, setelah pengajuan, pengecekan, anonimisasi, dan penyaringan.
- **Sekali cair.** Revisi dan zona abu-abu Ciko dapat menambah putaran penelaah (`ReviewDecisions.sol:129-134`, `PublicationSessions.sol:160-163`), sedangkan escrow Hugo habis pada eksekusi pertama.
- **Penolakan awal.** Sesi dapat ditolak sebelum ada penelaah (`PublicationSessions.sol:228-233,247-252`), dan refund Hugo tidak menangani kasus ini.
- **Peran.** `onlyOwner` Hugo perlu diselaraskan dengan session manager Ciko.

### Opsi penyelesaian q4 (Inferensi; termasuk konflik besar yang menurut `CLAUDE.md` perlu ditanyakan)

| Opsi | Cara | Kelebihan | Kekurangan |
|---|---|---|---|
| A. Tanpa q4 selama telaah | Nilai q4 sama untuk semua, reputasi hanya dicatat | Paling aman bagi anonimitas, paling sederhana | Lapisan Sybil dan mitigasi gaming berbasis q4 (hlm. 100, 133) hilang |
| B. Oracle reputasi tepercaya | Server menyimpan pemetaan rahasia, memberi tingkat q4 kasar, membuktikan dengan ZK simulasi, mint ditunda dan digabung | Mekanisme q1-q4 tetap hidup; sejalan dengan asumsi server tepercaya Ciko (`server/src/flows/flows.service.ts:452-456`); sesuai izin simulasi ZK | Server mengetahui pemetaan; perlu perubahan SBT dan alur klaim |
| C. Klaim pasca sesi oleh penelaah | Penelaah membuktikan kepemilikan pseudonim dan mengklaim reputasi kemudian | Pemetaan tidak disimpan server | Paling rumit; q4 tetap butuh pembuktian saat telaah |

**Rekomendasi saya: Opsi B untuk demo.** Laporan Ciko hlm. 85 juga mendukung pencatatan kontribusi secara agregat tanpa menyebut publikasinya.

**Keputusan yang perlu ditanyakan:**

1. Opsi q4 yang dipilih.
2. Apakah `EphemeralAccounts` Ciko boleh diubah agar satu orang dapat memakai banyak pseudonim tanpa membuka keterkaitan.
3. Besaran APC: tetap atau bebas.
4. Kebijakan dana saat ditolak di awal, saat revisi, dan saat zona abu-abu.
5. Apakah penyelesaian imbalan dilakukan per putaran atau setelah keputusan akhir.
6. Sumber dana penulis yang tidak menautkan dompetnya, misalnya deposit oleh relayer simulasi.

## 10. Yang layak dipakai ulang untuk integrasi dan risiko

### Dipakai ulang (Inferensi, belum dicoba dikompilasi di lingkungan integrasi)

| Berkas | Tindakan | Penyesuaian |
|---|---|---|
| `middleware/normalization.ts` | Salin apa adanya | Tanpa dependensi |
| `middleware/weighting/*.ts` | Salin apa adanya | Pertimbangkan catatan bahwa BWM memakai pendekatan tertutup |
| `middleware/topsis.ts` | Salin apa adanya | Hanya pratinjau |
| `middleware/sigmoid.ts` | Salin, lalu tambah varian | Tambah fungsi yang sama dengan rumus on-chain agar pratinjau sesuai |
| `middleware/qos/types.ts` | Salin apa adanya | Antarmuka simulator |
| `middleware/qos/heuristic.ts` | Salin, lalu ubah | Tambah penanda dan stopword bahasa Indonesia |
| `middleware/qos/index.ts` | Salin, lalu ubah | Tambah pilihan simulator; `createProvider` jangan memuat model; hapus ekspor `LocalModelProvider` |
| `middleware/qos/abstract.ts` | Salin | Jalankan hanya pada naskah anonim |
| `contracts/IncentiveEngine.sol` | Ambil `_topsis`, `_sigmoid`, `_sqrt`; tulis ulang sisanya | Lihat daftar di bawah |
| `contracts/ReputationSBT.sol` | Salin, lalu perbaiki | Perbaiki `triggerDecay`; sediakan jalur ubah λ dan pindah pemilik; tentukan kunci reputasi sesuai opsi q4 |
| `eval/core.ts` | Ambil `runPipeline` dan metrik | Pisahkan skenario lama |
| `server/index.ts` | Jangan disalin utuh | Ambil `BWM_PRESETS`, `resolveBwm`, logika konversi 1e18 dan sanitasi (baris 840-845), snapshot provenance |
| `frontend/editor.ts` | Jadikan acuan tampilan | Transparansi bobot tanpa alamat dan q4 asli |
| `eval/deploy-sepolia.ts` | Jadikan acuan urutan deploy | Sesuaikan tooling; jangan hardcode nama jaringan |
| `test/middleware/*.ts` | Salin | Sesuaikan runner bila pindah ke Hardhat 3 |
| `test/contracts/*.ts` | Jadikan acuan kasus | Tulis ulang mengikuti kontrak baru |
| `frontend/config/eval-datasets.ts` | Salin | Jadi data regresi; satukan preset dengan server |
| `eval/realdata/peerread-iclr2017-derived.json` | Opsional | Kalibrasi sebaran simulator; dataset perlu disitasi (`eval/realdata/README.md:11-12`) |

**Tidak perlu dipakai:** `middleware/qos/localModel.ts` (tanpa LLM), `public/*.html` dan `style.css` (frontend Roihan diutamakan), serta `planning.md` dan `docs/diagram-*.md` sebagai rujukan teknis karena sudah usang.

**Perubahan kontrak yang dibutuhkan (Inferensi, menunggu keputusan di Bagian 9):**

1. Pisahkan `deposit(sessionId)` dari penetapan penelaah.
2. Kaitkan escrow dengan `bytes32 sessionId` Ciko, bukan `uint256 batchId` yang dihitung klien.
3. Dukung banyak putaran atau tahan dana sampai keputusan akhir.
4. Tambah refund yang jelas untuk penolakan awal, timeout, dan kegagalan operator.
5. Validasi batch ada, bobot berjumlah 1e18, nilai matriks tidak melebihi 1e18, serta tidak ada alamat duplikat.
6. Ganti pengiriman langsung dengan pola klaim, agar satu alamat bermasalah tidak memblokir batch dan agar waktu mint dapat dipisahkan.
7. Hilangkan `journalName` dan daftar penelaah dari calldata yang menautkan penulis.
8. Selaraskan akses dengan session manager.
9. Putuskan nasib `receive()` dan sisa pembulatan.

**Keputusan tooling (Inferensi):**

- Prioritas pengguna mengarah ke Ciko, jadi Hardhat 3, viem, dan Solidity 0.8.28 layak menjadi basis.
- Pragma Hugo `^0.8.24` seharusnya dapat dikompilasi dengan 0.8.28, tetapi belum diuji.
- Tes Hugo berbasis ethers, TypeChain, dan chai perlu ditulis ulang atau dipisah.
- Bila Roihan dipertahankan dengan UUPS dan viaIR, penggabungan satu proyek kontrak perlu diuji sejak awal.
- Backend utama Roihan berbahasa Go, sehingga middleware TS paling mudah ditempatkan sebagai layanan terpisah, atau di dalam server NestJS Ciko.

### Risiko

| Risiko | Tingkat | Dampak | Mitigasi (Inferensi) |
|---|---|---|---|
| Kebocoran identitas lewat q4, mint, dan calldata | Tinggi | Tujuan utama Ciko gagal | Keputusan opsi q4; tingkat kasar; mint tertunda dan digabung |
| Dana terkunci karena operator gagal atau tidak ada refund | Tinggi | Dana penulis hilang | Timeout dan refund on-chain |
| Banyak putaran tidak didukung | Tinggi | Alur revisi Ciko terhenti | Rancang ulang escrow |
| Klaim ketahanan tidak berlaku untuk kontrak | Sedang-tinggi | Salah kutip hasil; ROI Sybil on-chain lebih tinggi | Samakan fungsi, lalu ukur ulang di EVM |
| Decay dapat dihindari, dan semantik aktif berbeda dari simulasi | Sedang | Reputasi tidak mencerminkan aktivitas | Perbaiki `triggerDecay`; uji multi-siklus on-chain |
| Skor q2/q3 tepercaya pada server | Sedang | Operator dapat mengatur imbalan | Rekam hash ulasan, versi provider, dan skor |
| Tanpa q4, gaming q2/q3 lebih mudah | Sedang | Laporan mencatat penurunan payoff karena q4 (hlm. 133) | Validasi editor buta atau deteksi tumpang tindih |
| Urutan penelaah di penyimpanan menentukan pemetaan imbalan (`server/index.ts:679-684,749-752`) | Sedang | Baris dapat tertukar; `POST /api/submission` tanpa autentikasi | Ikat baris ke pseudonim dan autentikasi |
| API tanpa autentikasi | Sedang | Siapa pun dapat memicu distribusi dan mengirim ulasan | Autentikasi per peran, walau disimulasikan |
| Baris no-show mengubah skor peserta | Sedang | Skor peserta terangkat | Keluarkan no-show sebelum normalisasi |
| Provider heuristik hanya bahasa Inggris | Sedang | q3 seragam nol pada demo berbahasa Indonesia | Tambah penanda bahasa Indonesia |
| Preset BWM tidak seragam | Rendah-sedang | Angka evaluasi tidak sama dengan perilaku server | Satu sumber preset |
| Biaya gas alamat baru lebih tinggi | Rendah | Laporan: 710.614 gas pada alamat acak (hlm. 107) dibanding 603.214 pada akun yang sudah ada (hlm. 124), keduanya n = 5. Inferensi: pseudonim Ciko mendekati angka pertama | Gunakan angka lebih tinggi untuk perencanaan Sepolia |
| RPC Sepolia di-hardcode | Rendah | Riwayat lokal dapat kosong | Pakai provider jaringan aktif |
| Tooling berbeda | Sedang | Port kontrak dan tes memakan waktu | Tetapkan basis tooling di awal |
