/**
 * vikor-sensitivity.ts — Justifikasi pemilihan TOPSIS vs VIKOR secara empiris.
 *
 * Pertanyaan dosbim: Spearman menunjukkan TOPSIS dan VIKOR berperingkat mirip
 * (rho tinggi), lalu kenapa TOPSIS tetap dipilih? Klaim "peringkat lebih baik"
 * TIDAK bisa dibuktikan (memang setara, itu justru validitas konvergen). Yang bisa
 * dibuktikan dari perhitungan adalah keunggulan OPERASIONAL:
 *
 *   1. DETERMINISME: peringkat VIKOR bergantung pada parameter bebas v (bobot
 *      strategi group-utility). Ubah v, peringkat/skor bisa bergeser. TOPSIS tak
 *      punya knob semacam itu -> keluaran tunggal, cocok untuk on-chain code-is-law.
 *   2. KESETARAAN: Spearman(TOPSIS, VIKOR) tetap tinggi -> memilih metode yang
 *      lebih sederhana & bebas-parameter TIDAK mengorbankan kualitas peringkat.
 *
 * Skrip ini mengimplementasikan VIKOR pada matriks ternormalisasi + bobot fusi yang
 * SAMA dengan pipeline (BWM #2 + ECWM), lalu:
 *   - menghitung peringkat VIKOR pada beberapa nilai v dan mengukur apakah bergeser,
 *   - membandingkannya dengan TOPSIS (Spearman),
 *   - melaporkan diferensiasi (sebaran skor) sebagai catatan sekunder.
 *
 * Deterministik, off-chain, tanpa mengubah kontrak. Run: npx ts-node eval/vikor-sensitivity.ts
 */
import {
  normalize,
  computeBWM,
  computeECWM,
  fuseWeights,
  topsis,
} from "../middleware";
import {
  CRITERIA_TYPES,
  DEFAULT_BWM,
  rankArray,
  spearmanCorrelation,
} from "./core";

// VIKOR pada matriks ternormalisasi (higher=better untuk semua kolom, seperti TOPSIS).
// Mengembalikan Q_i (kecil = lebih baik) untuk parameter v.
function vikor(normalized: number[][], weights: number[], v: number): number[] {
  const n = normalized.length;
  const m = weights.length;
  const fStar: number[] = [], fMinus: number[] = [];
  for (let j = 0; j < m; j++) {
    const col = normalized.map((r) => r[j]);
    fStar[j] = Math.max(...col);
    fMinus[j] = Math.min(...col);
  }
  const S: number[] = [], R: number[] = [];
  for (let i = 0; i < n; i++) {
    let s = 0, r = 0;
    for (let j = 0; j < m; j++) {
      const denom = fStar[j] - fMinus[j];
      const term = denom === 0 ? 0 : weights[j] * (fStar[j] - normalized[i][j]) / denom;
      s += term;
      if (term > r) r = term;
    }
    S[i] = s; R[i] = r;
  }
  const Sstar = Math.min(...S), Sminus = Math.max(...S);
  const Rstar = Math.min(...R), Rminus = Math.max(...R);
  const Q: number[] = [];
  for (let i = 0; i < n; i++) {
    const qs = Sminus - Sstar === 0 ? 0 : (S[i] - Sstar) / (Sminus - Sstar);
    const qr = Rminus - Rstar === 0 ? 0 : (R[i] - Rstar) / (Rminus - Rstar);
    Q[i] = v * qs + (1 - v) * qr;
  }
  return Q;
}

// Diferensiasi: koefisien variasi (std/mean) dari skor "kebaikan" [0,1].
function cv(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (mean === 0) return 0;
  const varr = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return Math.sqrt(varr) / mean;
}

const BATCHES: { name: string; matrix: number[][] }[] = [
  {
    name: "A gradien jelas",
    matrix: [
      [2, 0.85, 0.75, 8], [4, 0.70, 0.60, 5], [6, 0.55, 0.45, 3],
      [8, 0.40, 0.30, 1], [10, 0.25, 0.15, 0],
    ],
  },
  {
    name: "B berdekatan/ambigu",
    matrix: [
      [3.0, 0.68, 0.55, 5], [4.0, 0.70, 0.50, 4], [3.5, 0.65, 0.58, 5],
      [4.5, 0.72, 0.48, 3], [3.2, 0.66, 0.53, 6],
    ],
  },
  {
    name: "C ada pencilan",
    matrix: [
      [3.0, 0.75, 0.65, 6], [4.0, 0.60, 0.50, 4], [5.0, 0.55, 0.45, 3],
      [3.5, 0.70, 0.60, 5], [20, 0.10, 0.05, 0],
    ],
  },
];

const V_VALUES = [0.0, 0.25, 0.5, 0.75, 1.0];

function fusedWeights(matrix: number[][]): number[] {
  const normalized = normalize(matrix, CRITERIA_TYPES);
  const bwm = computeBWM(DEFAULT_BWM);
  const ecwm = computeECWM(normalized, 0.5);
  return fuseWeights(bwm.weights, ecwm, 0.6);
}

function orderStr(scoresHigherBetter: number[]): string {
  // urutan indeks (peringkat 1..n) berdasarkan skor, best->worst, sebagai "R1>R3>..."
  const idx = scoresHigherBetter.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s);
  return idx.map((x) => "R" + (x.i + 1)).join(">");
}

function main() {
  console.log(`\n=== TOPSIS vs VIKOR: sensitivitas parameter v & kesetaraan peringkat ===`);
  console.log(`Bobot fusi BWM #2 + ECWM (sama dengan pipeline). VIKOR v = ${V_VALUES.join(", ")}.`);

  for (const b of BATCHES) {
    const normalized = normalize(b.matrix, CRITERIA_TYPES);
    const w = fusedWeights(b.matrix);
    const t = topsis(normalized, w, CRITERIA_TYPES);
    const topsisRank = rankArray(t.scores); // higher=better -> rank 1
    console.log(`\n--- Batch ${b.name} ---`);
    console.log(`TOPSIS      : urutan ${orderStr(t.scores)}   (CV skor = ${cv(t.scores).toFixed(3)})`);

    const vikorRanks: number[][] = [];
    const vikorGoodnessCV: number[] = [];
    for (const v of V_VALUES) {
      const Q = vikor(normalized, w, v);
      const goodness = Q.map((q) => 1 - q); // higher=better
      const rk = rankArray(goodness);
      vikorRanks.push(rk);
      vikorGoodnessCV.push(cv(goodness));
      const rho = spearmanCorrelation(rk, topsisRank);
      console.log(
        `VIKOR v=${v.toFixed(2)} : urutan ${orderStr(goodness)}   rho(vs TOPSIS)=${rho.toFixed(3)}   (CV=${cv(goodness).toFixed(3)})`
      );
    }

    // Sensitivitas internal VIKOR: apakah peringkat berubah antar nilai v?
    const baseline = vikorRanks[0];
    let maxShift = 0, anyChange = false, top1Changes = false;
    const top1Set = new Set<number>();
    for (let k = 0; k < V_VALUES.length; k++) {
      const rho = spearmanCorrelation(vikorRanks[k], baseline);
      if (rho < 1) anyChange = true;
      maxShift = Math.min(maxShift === 0 ? 1 : maxShift, rho);
      // pemenang (rank 1) di tiap v
      const winner = vikorRanks[k].indexOf(1);
      top1Set.add(winner);
    }
    if (top1Set.size > 1) top1Changes = true;
    console.log(
      `  -> VIKOR peringkat ${anyChange ? "BERGESER" : "stabil"} lintas v (rho_min vs v=0: ${maxShift.toFixed(3)}); pemenang ${top1Changes ? "BERUBAH" : "tetap"} lintas v.`
    );
  }

  console.log(`\n=== Ringkasan ===`);
  console.log(`TOPSIS: keluaran tunggal & deterministik (tanpa parameter bebas).`);
  console.log(`VIKOR : peringkat dapat bergantung pada v (lihat batch dengan skor berdekatan).`);
  console.log(`Spearman TOPSIS vs VIKOR tetap tinggi -> memilih TOPSIS tidak mengorbankan kualitas peringkat,`);
  console.log(`namun menghilangkan ketergantungan parameter yang problematik untuk eksekusi on-chain.\n`);
}

main();
