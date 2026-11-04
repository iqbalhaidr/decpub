/**
 * Hybrid Weight Fusion — Linear Combination (Fase 2)
 *
 * Thesis ref: III.2.3.2 — Keputusan Teknik Fusi Bobot
 * Formula: W_j = λ * W_sub,j + (1 - λ) * W_obj,j
 *
 * λ = 1  → fully subjective (editor-driven)
 * λ = 0  → fully objective (data-driven)
 * λ = 0.5 → balanced hybrid
 */

/**
 * Fuse subjective and objective weights using linear combination.
 *
 * @param subjectiveWeights - W_sub from BWM
 * @param objectiveWeights  - W_obj from ECWM
 * @param lambda - editor authority coefficient ∈ [0, 1]
 * @returns fused final weights W_j
 */
export function fuseWeights(
  subjectiveWeights: number[],
  objectiveWeights: number[],
  lambda: number
): number[] {
  const m = subjectiveWeights.length;
  if (objectiveWeights.length !== m) {
    throw new Error("Weight vectors must have equal length");
  }
  if (lambda < 0 || lambda > 1) {
    throw new Error("Lambda must be in [0, 1]");
  }

  return subjectiveWeights.map(
    (ws, j) => lambda * ws + (1 - lambda) * objectiveWeights[j]
  );
}
