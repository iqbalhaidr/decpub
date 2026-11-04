/**
 * Best-Worst Method (BWM) — Subjective Weighting (Fase 2)
 *
 * Thesis ref: III.2.3.2 — Keputusan Metode Subjektif: BWM
 * Paper ref: Rezaei (2015) "Best-worst multi-criteria decision-making method"
 *
 * Input: Editor identifies the best and worst criteria, then provides:
 *   - bestToOthers[j]: preference of best criterion over criterion j (1-9)
 *   - othersToWorst[j]: preference of criterion j over worst criterion (1-9)
 *
 * Total comparisons: 2n - 3 (vs AHP's n(n-1)/2)
 *
 * The optimal weights minimize max |w_B/w_j - a_Bj| and |w_j/w_W - a_jW|
 * subject to sum(w_j) = 1, w_j >= 0.
 *
 * For practical implementation, we use the closed-form approximation
 * which produces near-optimal weights for consistent inputs.
 */

export interface BWMInput {
  /** Index of the best criterion (0-based) */
  bestIndex: number;
  /** Index of the worst criterion (0-based) */
  worstIndex: number;
  /** bestToOthers[j] = how many times best is preferred over j (1-9). bestToOthers[bestIndex] = 1 */
  bestToOthers: number[];
  /** othersToWorst[j] = how many times j is preferred over worst (1-9). othersToWorst[worstIndex] = 1 */
  othersToWorst: number[];
}

export interface BWMResult {
  weights: number[];
  consistencyRatio: number;
}

// Maximum consistency index by a_BW (Table from Rezaei 2015)
const CONSISTENCY_INDEX: Record<number, number> = {
  1: 0.0,
  2: 0.44,
  3: 1.0,
  4: 1.63,
  5: 2.3,
  6: 3.0,
  7: 3.73,
  8: 4.47,
  9: 5.23,
};

/**
 * Compute subjective weights using the Best-Worst Method.
 *
 * Uses the closed-form approximation: w_j ∝ 1/a_Bj (normalized)
 * then refines via the ratio consistency check.
 */
export function computeBWM(input: BWMInput): BWMResult {
  const { bestIndex, worstIndex, bestToOthers, othersToWorst } = input;
  const m = bestToOthers.length;

  if (othersToWorst.length !== m) {
    throw new Error("bestToOthers and othersToWorst must have the same length");
  }
  if (bestIndex === worstIndex) {
    throw new Error("Best and worst criteria must be different");
  }
  if (bestToOthers[bestIndex] !== 1) {
    throw new Error("bestToOthers[bestIndex] must be 1");
  }
  if (othersToWorst[worstIndex] !== 1) {
    throw new Error("othersToWorst[worstIndex] must be 1");
  }

  // Validate ranges
  for (let j = 0; j < m; j++) {
    if (bestToOthers[j] < 1 || bestToOthers[j] > 9) {
      throw new Error(`bestToOthers[${j}] must be in [1,9]`);
    }
    if (othersToWorst[j] < 1 || othersToWorst[j] > 9) {
      throw new Error(`othersToWorst[${j}] must be in [1,9]`);
    }
  }

  // Closed-form approximation:
  // w_B is determined by a_BW (best-to-worst preference)
  // w_j = w_B / a_Bj
  // Then normalize so sum = 1
  const aBW = bestToOthers[worstIndex]; // preference of best over worst

  // Raw weights proportional to 1/a_Bj
  const rawWeights: number[] = new Array(m);
  for (let j = 0; j < m; j++) {
    rawWeights[j] = 1 / bestToOthers[j];
  }

  // Normalize
  const sum = rawWeights.reduce((a, b) => a + b, 0);
  const weights = rawWeights.map((w) => w / sum);

  // Compute consistency ratio
  // ξ* = (max inconsistency) / CI(a_BW)
  let maxInconsistency = 0;
  for (let j = 0; j < m; j++) {
    // |w_B / w_j - a_Bj|
    if (weights[j] > 0) {
      const inc1 = Math.abs(weights[bestIndex] / weights[j] - bestToOthers[j]);
      if (inc1 > maxInconsistency) maxInconsistency = inc1;
    }
    // |w_j / w_W - a_jW|
    if (weights[worstIndex] > 0) {
      const inc2 = Math.abs(
        weights[j] / weights[worstIndex] - othersToWorst[j]
      );
      if (inc2 > maxInconsistency) maxInconsistency = inc2;
    }
  }

  const ci = CONSISTENCY_INDEX[aBW] ?? 5.23;
  const consistencyRatio = ci > 0 ? maxInconsistency / ci : 0;

  return { weights, consistencyRatio };
}
