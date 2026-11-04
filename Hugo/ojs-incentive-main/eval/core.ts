/**
 * eval/core.ts — Shared evaluation core (single source of truth).
 *
 * This module holds the evaluation ORCHESTRATION and metric helpers that were
 * previously inlined inside server/index.ts. Both the Express server and the
 * headless evaluation harness (eval/*.ts) import from here, so the numbers
 * reported in the thesis (Bab IV) are produced by exactly one code path that
 * wraps the real production engine in ../middleware.
 *
 * Pure functions only — no Express, no Hardhat. Safe to run under plain ts-node.
 */

import {
  normalize,
  CriterionType,
  computeBWM,
  computeECWM,
  computeECWMDetail,
  fuseWeights,
  topsis,
  distribute,
  SigmoidParams,
} from "../middleware";

// QoS criterion directions: q1 = days-to-submit (cost), q2/q3/q4 = benefit.
export const CRITERIA_TYPES: CriterionType[] = ["cost", "benefit", "benefit", "benefit"];

// Default editorial preset (BWM) — identical to the server default.
// Canonical editorial default "Balanced" preset (CR=0), identical to the server
// (BWM_PRESETS.balanced) and the eval datasets PRESETS.Balanced. Weights:
// q1=0.222, q2=0.222, q3=0.444, q4=0.111. Kept in ONE consistent form everywhere.
export const DEFAULT_BWM = {
  bestIndex: 2,
  worstIndex: 3,
  bestToOthers: [2, 2, 1, 4],
  othersToWorst: [2, 2, 4, 1],
};

export interface PipelineOpts {
  bwm?: typeof DEFAULT_BWM;
  lambda?: number;
  gamma?: number;
  sigmoid?: SigmoidParams;
  pool?: number;
}

// ================================================================
// METRIC HELPERS
// ================================================================

export function giniCoefficient(values: number[]): number {
  const n = values.length;
  if (n === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  if (mean === 0) return 0;
  let sumDiff = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumDiff += Math.abs(sorted[i] - sorted[j]);
    }
  }
  return sumDiff / (2 * n * n * mean);
}

export function differentiationRatio(values: number[]): number {
  const max = Math.max(...values);
  const min = Math.min(...values);
  return min > 0 ? max / min : max > 0 ? Infinity : 1;
}

export function rankArray(scores: number[]): number[] {
  const indexed = scores.map((s, i) => ({ s, i }));
  indexed.sort((a, b) => b.s - a.s);
  const ranks = new Array(scores.length);
  indexed.forEach((item, rank) => {
    ranks[item.i] = rank + 1;
  });
  return ranks;
}

export function spearmanCorrelation(rank1: number[], rank2: number[]): number {
  const n = rank1.length;
  if (n < 2) return 1;
  let sumD2 = 0;
  for (let i = 0; i < n; i++) {
    const d = rank1[i] - rank2[i];
    sumD2 += d * d;
  }
  return 1 - (6 * sumD2) / (n * (n * n - 1));
}

export function wsm(normalizedMatrix: number[][], weights: number[]): number[] {
  return normalizedMatrix.map((row) =>
    row.reduce((sum, val, j) => sum + val * weights[j], 0)
  );
}

// ================================================================
// PIPELINE — mirrors POST /api/pipeline
// ================================================================

export function runPipeline(matrix: number[][], opts: PipelineOpts = {}) {
  const {
    bwm = DEFAULT_BWM,
    lambda = 0.6,
    gamma = 0.5,
    sigmoid = { k: 10, x0: 0.5 },
    pool = 2.0,
  } = opts;

  const normalized = normalize(matrix, CRITERIA_TYPES);
  const bwmResult = computeBWM(bwm);
  const ecwmWeights = computeECWM(normalized, gamma);
  const weights = fuseWeights(bwmResult.weights, ecwmWeights, lambda);
  const topsisResult = topsis(normalized, weights, CRITERIA_TYPES);
  const distResult = distribute(topsisResult.scores, pool, sigmoid);

  return {
    normalized,
    bwmWeights: bwmResult.weights,
    bwmCR: bwmResult.consistencyRatio,
    ecwmWeights,
    ecwmDetail: computeECWMDetail(normalized, gamma),
    fusedWeights: weights,
    topsisScores: topsisResult.scores,
    ranking: topsisResult.ranking,
    sigmoidValues: distResult.sigmoidValues,
    shares: distResult.shares,
    rewards: distResult.rewards,
    metrics: {
      gini: giniCoefficient(distResult.rewards),
      diffRatio: differentiationRatio(distResult.rewards),
    },
  };
}

// ================================================================
// BASELINES — mirrors POST /api/baselines
// ================================================================

export function runBaselines(matrix: number[][], opts: PipelineOpts = {}) {
  const {
    bwm = DEFAULT_BWM,
    lambda = 0.6,
    gamma = 0.5,
    sigmoid = { k: 10, x0: 0.5 },
    pool = 2.0,
  } = opts;

  const n = matrix.length;
  const normalized = normalize(matrix, CRITERIA_TYPES);
  const bwmResult = computeBWM(bwm);
  const ecwmWeights = computeECWM(normalized, gamma);
  const fusedW = fuseWeights(bwmResult.weights, ecwmWeights, lambda);
  const hybridTopsis = topsis(normalized, fusedW, CRITERIA_TYPES);
  const hybridDist = distribute(hybridTopsis.scores, pool, sigmoid);
  const hybridRanks = rankArray(hybridTopsis.scores);

  const hybrid = {
    method: "Hybrid (proposed)",
    rewards: hybridDist.rewards,
    scores: hybridTopsis.scores,
    gini: giniCoefficient(hybridDist.rewards),
    diffRatio: differentiationRatio(hybridDist.rewards),
    ranks: hybridRanks,
    spearman: 1.0,
  };

  // B1: Equal
  const equalRewards = new Array(n).fill(pool / n);
  const b1 = { method: "B1: Equal Split", rewards: equalRewards, scores: new Array(n).fill(1 / n), gini: 0, diffRatio: 1, ranks: new Array(n).fill(1), spearman: 0 };

  // B2: Linear Proportional
  const linearTotal = hybridTopsis.scores.reduce((a, b) => a + b, 0);
  const linearRewards = linearTotal > 0 ? hybridTopsis.scores.map((s) => (s / linearTotal) * pool) : equalRewards;
  const b2 = { method: "B2: Linear Proportional", rewards: linearRewards, scores: hybridTopsis.scores, gini: giniCoefficient(linearRewards), diffRatio: differentiationRatio(linearRewards), ranks: rankArray(hybridTopsis.scores), spearman: spearmanCorrelation(rankArray(hybridTopsis.scores), hybridRanks) };

  // B3: BWM-only
  const bwmOnlyTopsis = topsis(normalized, bwmResult.weights, CRITERIA_TYPES);
  const bwmOnlyDist = distribute(bwmOnlyTopsis.scores, pool, sigmoid);
  const b3 = { method: "B3: BWM-only (λ=1)", rewards: bwmOnlyDist.rewards, scores: bwmOnlyTopsis.scores, gini: giniCoefficient(bwmOnlyDist.rewards), diffRatio: differentiationRatio(bwmOnlyDist.rewards), ranks: rankArray(bwmOnlyTopsis.scores), spearman: spearmanCorrelation(rankArray(bwmOnlyTopsis.scores), hybridRanks) };

  // B4: ECWM-only
  const ecwmOnlyTopsis = topsis(normalized, ecwmWeights, CRITERIA_TYPES);
  const ecwmOnlyDist = distribute(ecwmOnlyTopsis.scores, pool, sigmoid);
  const b4 = { method: "B4: ECWM-only (λ=0)", rewards: ecwmOnlyDist.rewards, scores: ecwmOnlyTopsis.scores, gini: giniCoefficient(ecwmOnlyDist.rewards), diffRatio: differentiationRatio(ecwmOnlyDist.rewards), ranks: rankArray(ecwmOnlyTopsis.scores), spearman: spearmanCorrelation(rankArray(ecwmOnlyTopsis.scores), hybridRanks) };

  // B5: WSM
  const wsmScores = wsm(normalized, fusedW);
  const wsmDist = distribute(wsmScores, pool, sigmoid);
  const b5 = { method: "B5: WSM", rewards: wsmDist.rewards, scores: wsmScores, gini: giniCoefficient(wsmDist.rewards), diffRatio: differentiationRatio(wsmDist.rewards), ranks: rankArray(wsmScores), spearman: spearmanCorrelation(rankArray(wsmScores), hybridRanks) };

  return { hybrid, baselines: [b1, b2, b3, b4, b5] };
}

// ================================================================
// MULTI-CYCLE — mirrors POST /api/multicycle
// ================================================================

export interface MulticycleOpts extends PipelineOpts {
  numCycles?: number;
  decayRate?: number;
  daysBetweenCycles?: number;
}

export function runMulticycle(opts: MulticycleOpts = {}) {
  const {
    numCycles = 10,
    bwm = DEFAULT_BWM,
    lambda = 0.6,
    gamma = 0.5,
    sigmoid = { k: 10, x0: 0.5 },
    pool = 2.0,
    decayRate = 0.02,
    daysBetweenCycles = 30,
  } = opts;

  const names = ["Alice", "Bob", "Charlie", "Diana", "Eve"];
  let sbtBalances = [0, 0, 0, 0, 0];
  let cumulativeRewards = [0, 0, 0, 0, 0];
  const cycles: any[] = [];

  for (let c = 1; c <= numCycles; c++) {
    const progress = (c - 1) / (numCycles - 1);
    const rawMatrix = [
      [2.5, 8.5, 0.9, 0],
      [6.0, 5.5, 0.65, 0],
      [7 - 4 * progress, 4 + 4 * progress, 0.5 + 0.35 * progress, 0],
      [3 + 5 * progress, 8 - 4 * progress, 0.9 - 0.35 * progress, 0],
      [4.5, 6.5, 0.72, 0],
    ];

    const eveInactive = [3, 6, 9].includes(c);
    const daysInactive = names.map((_, i) => {
      if (i === 4 && (c === 4 || c === 7 || c === 10)) return daysBetweenCycles;
      return 0;
    });

    const decayedBalances = sbtBalances.map((bal, i) =>
      daysInactive[i] > 0 ? bal * Math.pow(1 - decayRate, daysInactive[i]) : bal
    );

    const q4Values = decayedBalances;
    const matrix = rawMatrix.map((row, i) => [row[0], row[1], row[2], q4Values[i]]);

    const normalized = normalize(matrix, CRITERIA_TYPES);
    const bwmResult = computeBWM(bwm);
    const ecwmWeights = computeECWM(normalized, gamma);
    const weights = fuseWeights(bwmResult.weights, ecwmWeights, lambda);
    const topsisResult = topsis(normalized, weights, CRITERIA_TYPES);
    const distResult = distribute(topsisResult.scores, pool, sigmoid);

    sbtBalances = decayedBalances.map((bal, i) => {
      if (i === 4 && eveInactive) return bal;
      return bal + distResult.sigmoidValues[i];
    });

    cumulativeRewards = cumulativeRewards.map((cum, i) => {
      if (i === 4 && eveInactive) return cum;
      return cum + distResult.rewards[i];
    });

    cycles.push({
      cycle: c,
      scores: topsisResult.scores,
      rewards: distResult.rewards,
      shares: distResult.shares,
      sbtBalances: [...sbtBalances],
      gini: giniCoefficient(distResult.rewards),
      cumulativeRewards: [...cumulativeRewards],
      eveInactive,
    });
  }

  return { reviewerNames: names, numCycles, cycles, parameters: { lambda, gamma, sigmoid, pool, decayRate, daysBetweenCycles } };
}
