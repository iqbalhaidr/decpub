/**
 * Pipeline off-chain Hugo: normalisasi -> bobot (BWM + ECWM + fusi) -> TOPSIS -> sigmoid.
 * Sama dengan `runPipeline` di `Hugo/.../eval/core.ts`, tanpa metrik evaluasi.
 */
import { normalize } from "./normalization.js";
import { computeBWM, computeECWM, fuseWeights } from "./weighting/index.js";
import { topsis } from "./topsis.js";
import { distribute, type SigmoidParams } from "./sigmoid.js";
import { CRITERIA_TYPES, DEFAULTS, PRESETS, bwmInput, type Preset } from "./presets.js";

export interface PipelineOptions {
  preset?: Preset;
  lambda?: number;
  gamma?: number;
  sigmoid?: SigmoidParams;
  /** Besar pool (satuan bebas, mis. ETH). */
  pool?: number;
}

export function runPipeline(matrix: number[][], opts: PipelineOptions = {}) {
  const { preset = PRESETS.Balanced, lambda = DEFAULTS.lambda, gamma = DEFAULTS.gamma, pool = 2 } = opts;
  const sig = opts.sigmoid ?? { ...DEFAULTS.sigmoid };

  const normalized = normalize(matrix, CRITERIA_TYPES);
  const bwm = computeBWM(bwmInput(preset));
  const ecwm = computeECWM(normalized, gamma);
  const weights = fuseWeights(bwm.weights, ecwm, lambda);
  const t = topsis(normalized, weights, CRITERIA_TYPES);
  const dist = distribute(t.scores, pool, sig);
  return {
    normalized,
    bwmWeights: bwm.weights,
    bwmCR: bwm.consistencyRatio,
    ecwmWeights: ecwm,
    fusedWeights: weights,
    topsisScores: t.scores,
    ranking: t.ranking,
    sigmoidValues: dist.sigmoidValues,
    shares: dist.shares,
    rewards: dist.rewards,
  };
}
