/**
 * TOPSIS (off-chain reference implementation)
 *
 * This is a TypeScript reference for testing. The authoritative
 * implementation lives in IncentiveEngine.sol (on-chain).
 *
 * Thesis ref: III.2.3.3 — Keputusan Metode Perangkingan: TOPSIS (Fase 3)
 *
 * Steps:
 * 1. Build weighted normalized matrix: v_ij = w_j * r_ij
 * 2. Determine PIS (A*) and NIS (A-)
 * 3. Compute Euclidean distances D_i* and D_i-
 * 4. Compute closeness coefficient S_i = D_i- / (D_i* + D_i-)
 */

import { CriterionType } from "./normalization";

export interface TOPSISResult {
  scores: number[];
  ranking: number[]; // indices sorted by score descending
}

/**
 * Run TOPSIS on a normalized decision matrix with given weights.
 *
 * @param normalizedMatrix - n×m matrix (output of normalize())
 * @param weights - m final fused weights (output of fuseWeights())
 * @param types - m criterion types
 * @returns scores S_i ∈ [0,1] and ranking (indices, best first)
 */
export function topsis(
  normalizedMatrix: number[][],
  weights: number[],
  types: CriterionType[]
): TOPSISResult {
  const n = normalizedMatrix.length;
  const m = weights.length;

  // Step 1: Weighted normalized matrix
  const V: number[][] = normalizedMatrix.map((row) =>
    row.map((val, j) => val * weights[j])
  );

  // Step 2: PIS and NIS
  const pis: number[] = new Array(m);
  const nis: number[] = new Array(m);
  for (let j = 0; j < m; j++) {
    const colValues = V.map((row) => row[j]);
    // After normalization, both benefit and cost are already oriented
    // (higher = better due to min-max with cost inversion).
    // So PIS = max, NIS = min for all criteria.
    pis[j] = Math.max(...colValues);
    nis[j] = Math.min(...colValues);
  }

  // Step 3: Euclidean distances
  const dPlus: number[] = new Array(n);
  const dMinus: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let sumPlus = 0;
    let sumMinus = 0;
    for (let j = 0; j < m; j++) {
      sumPlus += (V[i][j] - pis[j]) ** 2;
      sumMinus += (V[i][j] - nis[j]) ** 2;
    }
    dPlus[i] = Math.sqrt(sumPlus);
    dMinus[i] = Math.sqrt(sumMinus);
  }

  // Step 4: Closeness coefficient
  const scores: number[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const denom = dPlus[i] + dMinus[i];
    scores[i] = denom === 0 ? 0.5 : dMinus[i] / denom;
  }

  // Ranking: indices sorted by score descending
  const ranking = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => scores[b] - scores[a]
  );

  return { scores, ranking };
}
