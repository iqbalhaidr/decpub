/**
 * eval/robustness.ts — IV.4.5 (M1, M3)
 *
 * Generalizes the free-riding suppression result beyond the single constructive
 * dataset D2. Generates N random batches (default 500), each with 6 honest
 * reviewers and 2 free-riders whose q2/q3 ranges are taken from the REAL derived
 * distribution (PeerRead ICLR 2017; see eval/realdata/), runs the real pipeline on
 * each, and reports aggregate statistics:
 *   - honest/free-rider reward ratio (mean, std, min)
 *   - Gini coefficient of the reward vector (mean, std)
 *   - fraction of batches with clean separation (every free-rider earns less than
 *     every honest reviewer)
 *
 * Determinism: a seeded PRNG (mulberry32) with a FIXED seed makes every run
 * byte-identical and reproducible. Change SEED only intentionally.
 *
 * Run: npx ts-node eval/robustness.ts
 */

import { runPipeline, giniCoefficient } from "./core";

export const SEED = 0xc0ffee; // fixed seed — do not change without re-deriving IV.4.5
export const N_BATCHES = 500;

/** mulberry32 — small, fast, deterministic 32-bit PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Per-criterion ranges taken from the REAL derived q2/q3 distribution (PeerRead
// ICLR 2017): honest reviews cluster q2~0.62-0.80 / q3~0.40-0.72; low-effort
// (free-rider) reviews q2~0.45-0.60 / q3~0.10-0.22. q1 = days (cost): free-riders
// are fast-but-shallow (rush), honest take longer. q4 = SBT balance.
const HONEST = {
  q1: [2, 5],
  q2: [0.62, 0.80],
  q3: [0.40, 0.72],
  q4: [70, 110],
};
const FREE_RIDER = {
  q1: [1, 3],
  q2: [0.45, 0.60],
  q3: [0.10, 0.22],
  q4: [20, 50],
};

function std(values: number[], mean: number): number {
  const v = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  return Math.sqrt(v);
}

export interface RobustnessResult {
  seed: number;
  nBatches: number;
  ratio: { mean: number; std: number; min: number };
  gini: { mean: number; std: number };
  freeRiderSmallest: { count: number; total: number; fraction: number };
}

export function runRobustness(seed = SEED, nBatches = N_BATCHES): RobustnessResult {
  const rng = mulberry32(seed);
  const pick = (range: number[]) => range[0] + rng() * (range[1] - range[0]);

  const N_HONEST = 6, N_FR = 2;
  const ratios: number[] = [];
  const ginis: number[] = [];
  let frSmallest = 0;

  for (let b = 0; b < nBatches; b++) {
    // 6 honest + 2 free-riders; free-riders placed last.
    const matrix: number[][] = [];
    for (let i = 0; i < N_HONEST; i++) {
      matrix.push([pick(HONEST.q1), pick(HONEST.q2), pick(HONEST.q3), pick(HONEST.q4)]);
    }
    for (let i = 0; i < N_FR; i++) {
      matrix.push([pick(FREE_RIDER.q1), pick(FREE_RIDER.q2), pick(FREE_RIDER.q3), pick(FREE_RIDER.q4)]);
    }
    const frIdx = Array.from({ length: N_FR }, (_, i) => N_HONEST + i);

    const { rewards } = runPipeline(matrix);
    const honest = rewards.filter((_, i) => !frIdx.includes(i));
    const frRewards = frIdx.map((i) => rewards[i]);
    const avgHonest = honest.reduce((a, c) => a + c, 0) / honest.length;
    const avgFR = frRewards.reduce((a, c) => a + c, 0) / frRewards.length;
    ratios.push(avgHonest / avgFR);
    ginis.push(giniCoefficient(rewards));
    // clean separation: every free-rider earns strictly less than every honest reviewer
    if (Math.max(...frRewards) < Math.min(...honest)) frSmallest++;
  }

  const ratioMean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  const giniMean = ginis.reduce((a, b) => a + b, 0) / ginis.length;

  return {
    seed,
    nBatches,
    ratio: { mean: ratioMean, std: std(ratios, ratioMean), min: Math.min(...ratios) },
    gini: { mean: giniMean, std: std(ginis, giniMean) },
    freeRiderSmallest: { count: frSmallest, total: nBatches, fraction: frSmallest / nBatches },
  };
}

if (require.main === module) {
  const r = runRobustness();
  console.log(`\n=== IV.4.5 — Robustness ${r.nBatches} batch acak (seed=0x${r.seed.toString(16)}) ===`);
  console.log(`  Rasio honest/free-rider : mean=${r.ratio.mean.toFixed(2)}  std=${r.ratio.std.toFixed(2)}  min=${r.ratio.min.toFixed(2)}`);
  console.log(`  Koefisien Gini imbalan  : mean=${r.gini.mean.toFixed(3)}  std=${r.gini.std.toFixed(3)}`);
  console.log(`  Separasi bersih (FR<honest): ${r.freeRiderSmallest.count}/${r.freeRiderSmallest.total} (${(r.freeRiderSmallest.fraction * 100).toFixed(0)}%)`);
  console.log("");
}
