/**
 * Entropy-CRITIC Weighted Method (ECWM) — Objective Weighting (Fase 2)
 *
 * Thesis ref: III.2.3.2 — Keputusan Metode Objektif: ECWM
 * Paper ref: Zafar et al. (2021) — Entropy-CRITIC fusion
 *
 * Combines:
 * - Entropy: measures information divergence (dispersion) per criterion
 * - CRITIC: measures contrast intensity + inter-criteria conflict via correlation
 *
 * Final objective weight: W_obj,j = 0.5 * ew_j + 0.5 * cw_j
 */

/** Step-by-step intermediates of the Entropy method (for transparency/audit). */
export interface EntropyDetail {
  colSums: number[]; // sum_i x_ij (denominator of p_ij)
  entropy: number[]; // e_j ∈ [0,1]
  divergence: number[]; // d_j = 1 - e_j
  weights: number[]; // ew_j = d_j / Σ d_j
}

/** Step-by-step intermediates of the CRITIC method (for transparency/audit). */
export interface CRITICDetail {
  sigma: number[]; // σ_j (standard deviation = contrast intensity)
  correlation: number[][]; // r_jk (Pearson correlation matrix)
  conflict: number[]; // Σ_k (1 - r_jk)
  info: number[]; // C_j = σ_j · conflict_j
  weights: number[]; // cw_j = C_j / Σ C_j
}

/** Step-by-step intermediates of the full ECWM fusion. */
export interface ECWMDetail {
  gamma: number; // weight on Entropy (dispersion)
  beta: number; // weight on CRITIC (correlation), β = 1 − γ
  entropy: EntropyDetail;
  critic: CRITICDetail;
  weights: number[]; // ecwm_j = γ·ew_j + β·cw_j
}

/**
 * Compute Entropy weights WITH intermediates.
 *
 * Steps:
 * 1. Compute proportions p_ij = x_ij / sum_i(x_ij)
 * 2. Compute entropy e_j = -1/ln(n) * sum(p_ij * ln(p_ij))
 * 3. Compute divergence d_j = 1 - e_j
 * 4. Normalize: ew_j = d_j / sum(d_j)
 */
export function computeEntropyDetail(normalizedMatrix: number[][]): EntropyDetail {
  const n = normalizedMatrix.length;
  const m = normalizedMatrix[0].length;
  // n <= 1: tidak ada informasi untuk dibedakan; ln(1)=0 membuat k tak hingga.
  // Kembalikan bobot seragam agar tidak menghasilkan NaN (0 × Infinity).
  if (n <= 1) {
    const colSums = (normalizedMatrix[0] || []).slice();
    return { colSums, entropy: new Array(m).fill(0), divergence: new Array(m).fill(0), weights: new Array(m).fill(1 / m) };
  }
  const k = 1 / Math.log(n); // normalization constant

  const colSums: number[] = new Array(m).fill(0);
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) colSums[j] += normalizedMatrix[i][j];
  }

  const entropy: number[] = new Array(m);
  const divergence: number[] = new Array(m);
  for (let j = 0; j < m; j++) {
    let e = 0;
    for (let i = 0; i < n; i++) {
      const pij = colSums[j] > 0 ? normalizedMatrix[i][j] / colSums[j] : 0;
      if (pij > 0) e -= pij * Math.log(pij);
    }
    e *= k;
    entropy[j] = e;
    divergence[j] = 1 - e;
  }

  const divSum = divergence.reduce((a, b) => a + b, 0);
  const weights =
    divSum === 0 ? new Array(m).fill(1 / m) : divergence.map((d) => d / divSum);

  return { colSums, entropy, divergence, weights };
}

/**
 * Compute Entropy weights from a normalized decision matrix.
 */
export function computeEntropyWeights(normalizedMatrix: number[][]): number[] {
  return computeEntropyDetail(normalizedMatrix).weights;
}

/**
 * Compute Pearson correlation coefficient between two arrays.
 */
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  let sumX = 0,
    sumY = 0,
    sumXY = 0,
    sumX2 = 0,
    sumY2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
    sumY2 += y[i] * y[i];
  }
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
  );
  if (denominator === 0) return 0;
  return numerator / denominator;
}

/**
 * Compute standard deviation of an array.
 */
function stddev(arr: number[]): number {
  const n = arr.length;
  const mean = arr.reduce((a, b) => a + b, 0) / n;
  const variance = arr.reduce((sum, x) => sum + (x - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
}

/**
 * Compute CRITIC weights from a normalized decision matrix.
 *
 * Steps:
 * 1. Compute σ_j (standard deviation per criterion — contrast intensity)
 * 2. Compute r_jk (Pearson correlation between criteria j and k)
 * 3. Compute C_j = σ_j * sum_k(1 - r_jk)  (information content)
 * 4. Normalize: cw_j = C_j / sum(C_j)
 */
export function computeCRITICDetail(normalizedMatrix: number[][]): CRITICDetail {
  const m = normalizedMatrix[0].length;

  // Extract columns
  const columns: number[][] = [];
  for (let j = 0; j < m; j++) {
    columns.push(normalizedMatrix.map((row) => row[j]));
  }

  // Step 1: Standard deviations (contrast intensity)
  const sigma = columns.map((col) => stddev(col));

  // Step 2: Correlation matrix + Step 3: information content
  const correlation: number[][] = [];
  const conflict: number[] = new Array(m).fill(0);
  const info: number[] = new Array(m);
  for (let j = 0; j < m; j++) {
    correlation.push(new Array(m));
    let conflictSum = 0;
    for (let k = 0; k < m; k++) {
      const rjk = pearsonCorrelation(columns[j], columns[k]);
      correlation[j][k] = rjk;
      conflictSum += 1 - rjk;
    }
    conflict[j] = conflictSum;
    info[j] = sigma[j] * conflictSum;
  }

  // Step 4: Normalize
  const cSum = info.reduce((a, b) => a + b, 0);
  const weights = cSum === 0 ? new Array(m).fill(1 / m) : info.map((c) => c / cSum);

  return { sigma, correlation, conflict, info, weights };
}

/**
 * Compute CRITIC weights from a normalized decision matrix.
 *
 * Steps:
 * 1. σ_j (standard deviation per criterion — contrast intensity)
 * 2. r_jk (Pearson correlation between criteria j and k)
 * 3. C_j = σ_j * sum_k(1 - r_jk)  (information content)
 * 4. Normalize: cw_j = C_j / sum(C_j)
 */
export function computeCRITICWeights(normalizedMatrix: number[][]): number[] {
  return computeCRITICDetail(normalizedMatrix).weights;
}

/**
 * Compute fused ECWM objective weights.
 *
 * W_obj,j = γ * ew_j + β * cw_j  where γ + β = 1
 *
 * Default: γ = β = 0.5 (equal importance of dispersion and correlation)
 */
export function computeECWM(
  normalizedMatrix: number[][],
  gamma: number = 0.5
): number[] {
  return computeECWMDetail(normalizedMatrix, gamma).weights;
}

/**
 * Compute ECWM weights WITH all Entropy + CRITIC intermediates exposed,
 * for transparent step-by-step reporting (Step 2 derivation in the UI/report).
 */
export function computeECWMDetail(
  normalizedMatrix: number[][],
  gamma: number = 0.5
): ECWMDetail {
  const entropy = computeEntropyDetail(normalizedMatrix);
  const critic = computeCRITICDetail(normalizedMatrix);
  const beta = 1 - gamma;
  const weights = entropy.weights.map((e, j) => gamma * e + beta * critic.weights[j]);
  return { gamma, beta, entropy, critic, weights };
}
