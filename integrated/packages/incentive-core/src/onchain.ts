/**
 * Jembatan ke `IncentiveEngine`: konversi masukan ke format kontrak (bilangan bulat skala 1e18)
 * dan model referensi bilangan bulat yang meniru `_topsis`, `_sigmoid`, dan pembagian escrow
 * kontrak PERSIS (pembulatan ke bawah di tempat yang sama). Dipakai tes untuk memastikan kontrak
 * dan model off-chain tidak menyimpang, dan oleh server (M7) untuk pratinjau yang jujur.
 *
 * Catatan D5: fungsi sigmoid kontrak BUKAN logistik. `sigmoidOnChainFloat` adalah versi
 * floating-point dari fungsi yang sama, untuk pratinjau yang cocok dengan yang dieksekusi chain.
 */
import type { SigmoidParams } from "./sigmoid.js";

export const PRECISION = 10n ** 18n;
export const NUM_CRITERIA = 4;

/** Desimal -> bilangan bulat skala 1e18 (menghindari galat notasi ilmiah `Number`). */
export function toE18(x: number): bigint {
  if (!Number.isFinite(x)) throw new Error("nilai tidak hingga");
  const [intPart, frac = ""] = x.toFixed(18).split(".");
  return BigInt(intPart) * PRECISION + BigInt(frac.padEnd(18, "0"));
}

/** Matriks ternormalisasi [0,1] -> skala 1e18. */
export function matrixToE18(matrix: number[][]): bigint[][] {
  return matrix.map((row) => row.map(toE18));
}

/**
 * Bobot -> skala 1e18 dengan jumlah TEPAT 1e18 (kontrak menolak selainnya). Bobot dinormalkan
 * lebih dulu; selisih pembulatan (beberapa wei) ditambahkan ke bobot terbesar.
 */
export function weightsToE18(weights: number[]): [bigint, bigint, bigint, bigint] {
  if (weights.length !== NUM_CRITERIA) throw new Error("bobot harus 4 nilai");
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) throw new Error("jumlah bobot harus positif");
  const w = weights.map((x) => toE18(x / sum));
  const diff = PRECISION - w.reduce((a, b) => a + b, 0n);
  let top = 0;
  for (let i = 1; i < w.length; i++) if (w[i] > w[top]) top = i;
  w[top] += diff;
  return w as [bigint, bigint, bigint, bigint];
}

const sqrt = (x: bigint): bigint => {
  if (x === 0n) return 0n;
  let z = (x + 1n) / 2n;
  let y = x;
  while (z < y) {
    y = z;
    z = (x / z + z) / 2n;
  }
  return y;
};

const abs = (x: bigint) => (x < 0n ? -x : x);

/** `IncentiveEngine._topsis`. */
export function topsisFixed(matrix: bigint[][], weights: readonly bigint[]): bigint[] {
  const n = matrix.length;
  const pis = [0n, 0n, 0n, 0n];
  const nis = Array<bigint>(4).fill(2n ** 256n - 1n);
  const V = matrix.map((row) =>
    row.map((v, j) => {
      const x = (v * weights[j]) / PRECISION;
      if (x > pis[j]) pis[j] = x;
      if (x < nis[j]) nis[j] = x;
      return x;
    }),
  );
  const scores: bigint[] = [];
  for (let i = 0; i < n; i++) {
    let dPlusSq = 0n;
    let dMinusSq = 0n;
    for (let j = 0; j < NUM_CRITERIA; j++) {
      dPlusSq += abs(V[i][j] - pis[j]) ** 2n;
      dMinusSq += abs(V[i][j] - nis[j]) ** 2n;
    }
    const dPlus = sqrt(dPlusSq);
    const dMinus = sqrt(dMinusSq);
    const denom = dPlus + dMinus;
    scores.push(denom === 0n ? PRECISION / 2n : (dMinus * PRECISION) / denom);
  }
  return scores;
}

/** `IncentiveEngine._sigmoid` (BUKAN logistik). Pembagian Solidity memotong ke arah nol. */
export function sigmoidFixed(score: bigint, k: bigint, x0: bigint): bigint {
  const x = ((score - x0) * k) / PRECISION; // BigInt `/` juga memotong ke arah nol
  if (x > 10n * PRECISION) return PRECISION;
  if (x < -10n * PRECISION) return 0n;
  if (x >= 0n) return PRECISION / 2n + ((PRECISION / 2n) * x) / (x + PRECISION);
  const ux = -x;
  return PRECISION / 2n - ((PRECISION / 2n) * ux) / (ux + PRECISION);
}

export interface FixedDistribution {
  scores: bigint[];
  sigmoidValues: bigint[];
  sigmoidSum: bigint;
  /** Imbalan ETH (wei) per baris. Jumlahnya tepat sama dengan escrow. */
  amounts: bigint[];
}

/** Meniru `executeDistribution` (tanpa pemeriksaan akses): skor, sigmoid, dan pembagian escrow. */
export function distributeFixed(
  matrix: bigint[][],
  weights: readonly bigint[],
  escrow: bigint,
  k: bigint = 10n * PRECISION,
  x0: bigint = PRECISION / 2n,
): FixedDistribution {
  const scores = topsisFixed(matrix, weights);
  const sigmoidValues = scores.map((s) => sigmoidFixed(s, k, x0));
  const sigmoidSum = sigmoidValues.reduce((a, b) => a + b, 0n);
  if (sigmoidSum === 0n) throw new Error("tidak ada imbalan (jumlah sigmoid 0)");
  const amounts = sigmoidValues.map((v) => (escrow * v) / sigmoidSum);
  const assigned = amounts.reduce((a, b) => a + b, 0n);
  let top = 0;
  for (let i = 1; i < sigmoidValues.length; i++) if (sigmoidValues[i] > sigmoidValues[top]) top = i;
  amounts[top] += escrow - assigned;
  return { scores, sigmoidValues, sigmoidSum, amounts };
}

/** Versi floating-point fungsi sigmoid KONTRAK (rasional, bukan logistik). */
export function sigmoidOnChainFloat(score: number, p: SigmoidParams): number {
  const x = p.k * (score - p.x0);
  if (x > 10) return 1;
  if (x < -10) return 0;
  return x >= 0 ? 0.5 + (0.5 * x) / (x + 1) : 0.5 - (0.5 * -x) / (-x + 1);
}

/** Pratinjau distribusi yang cocok dengan kontrak, bukan dengan `distribute` logistik Hugo. */
export function distributeOnChainFloat(scores: number[], pool: number, p: SigmoidParams) {
  const sigmoidValues = scores.map((s) => sigmoidOnChainFloat(s, p));
  const total = sigmoidValues.reduce((a, b) => a + b, 0);
  const shares = sigmoidValues.map((v) => v / total);
  return { sigmoidValues, shares, rewards: shares.map((s) => s * pool) };
}
