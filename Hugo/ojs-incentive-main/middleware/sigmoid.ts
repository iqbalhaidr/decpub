/**
 * Sigmoid Distribution Function (Fase 4 — off-chain reference)
 *
 * Thesis ref: III.2.3.4 — Keputusan Fungsi Sigmoid dan Peluruhan
 * On-chain: IncentiveEngine.sol._sigmoid()
 *
 * Maps TOPSIS scores S_i ∈ [0,1] to reward shares via non-linear
 * differentiation. High performers get proportionally MORE than
 * their score difference would suggest (contrast amplification).
 *
 * Formula: f(S) = 1 / (1 + e^(-k * (S - x0)))
 *
 * Parameters:
 *   k  = steepness (higher → sharper transition)
 *   x0 = inflection point (center of the S-curve)
 */

export interface SigmoidParams {
  k: number;   // steepness
  x0: number;  // inflection point (typically 0.5)
}

export interface DistributionResult {
  /** Raw sigmoid output per reviewer */
  sigmoidValues: number[];
  /** Normalized shares (sum = 1) */
  shares: number[];
  /** Absolute reward per reviewer (shares × pool) */
  rewards: number[];
}

/**
 * Compute sigmoid value for a single TOPSIS score.
 */
export function sigmoid(score: number, params: SigmoidParams): number {
  const x = params.k * (score - params.x0);
  return 1 / (1 + Math.exp(-x));
}

/**
 * Distribute a reward pool across reviewers based on TOPSIS scores
 * using the sigmoid mapping function.
 *
 * @param scores - TOPSIS closeness coefficients S_i ∈ [0,1]
 * @param pool - Total reward pool (e.g., escrow amount in ETH)
 * @param params - Sigmoid parameters {k, x0}
 * @returns sigmoid values, normalized shares, and absolute rewards
 */
export function distribute(
  scores: number[],
  pool: number,
  params: SigmoidParams
): DistributionResult {
  const sigmoidValues = scores.map((s) => sigmoid(s, params));
  const total = sigmoidValues.reduce((a, b) => a + b, 0);

  const shares = total > 0
    ? sigmoidValues.map((v) => v / total)
    : sigmoidValues.map(() => 1 / scores.length);

  const rewards = shares.map((s) => s * pool);

  return { sigmoidValues, shares, rewards };
}
