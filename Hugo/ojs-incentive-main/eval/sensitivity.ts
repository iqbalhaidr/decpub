/**
 * eval/sensitivity.ts — IV.4.4 (M3, M4)
 *
 * Sweeps the three control parameters and reports their measurable, monotonic
 * effect on system output:
 *   k          (sigmoid steepness)   -> honest/free-rider reward ratio (D2)
 *   x0         (sigmoid inflection)  -> honest/free-rider reward ratio (D2)
 *   lambdaDecay (reputation decay)   -> reputation half-life in days
 *
 * The reward ratios are produced by the real pipeline on D2; the half-life is
 * the analytic inverse of the decay law balance *= (1 - r)^days.
 *
 * Run: npx ts-node eval/sensitivity.ts
 */

import { FR, FR_L } from "../frontend/config/eval-datasets";
import { runPipeline } from "./core";

const FR_INDICES = FR_L.map((l, i) => (/Free/.test(l) ? i : -1)).filter((i) => i >= 0);

/** Average honest reward / average free-rider reward on D2 for a given sigmoid config. */
function honestToFreeRiderRatio(k: number, x0: number): number {
  const { rewards } = runPipeline(FR, { sigmoid: { k, x0 } });
  const honest = rewards.filter((_, i) => !FR_INDICES.includes(i));
  const avgHonest = honest.reduce((a, b) => a + b, 0) / honest.length;
  const avgFR = FR_INDICES.reduce((a, i) => a + rewards[i], 0) / FR_INDICES.length;
  return avgHonest / avgFR;
}

/** Reputation half-life (days) for a per-day decay rate r: (1-r)^t = 0.5. */
export function halfLifeDays(decayRate: number): number {
  return Math.log(0.5) / Math.log(1 - decayRate);
}

export function runSensitivity() {
  const kValues = [5, 10, 15, 20];
  const x0Values = [0.3, 0.5, 0.7];
  const decayValues = [0.01, 0.02, 0.05];

  return {
    k: kValues.map((k) => ({ k, ratio: honestToFreeRiderRatio(k, 0.5) })),
    x0: x0Values.map((x0) => ({ x0, ratio: honestToFreeRiderRatio(10, x0) })),
    decay: decayValues.map((r) => ({ decayRate: r, halfLifeDays: halfLifeDays(r) })),
  };
}

if (require.main === module) {
  const s = runSensitivity();
  console.log("\n=== IV.4.4 — Sensitivitas parameter kendali (D2) ===");
  console.log("  k (steepness):     " + s.k.map((r) => `${r.k}=${r.ratio.toFixed(2)}x`).join("  "));
  console.log("  x0 (inflection):   " + s.x0.map((r) => `${r.x0}=${r.ratio.toFixed(2)}x`).join("  "));
  console.log("  lambda_decay:      " + s.decay.map((r) => `${r.decayRate}=${r.halfLifeDays.toFixed(1)}d`).join("  "));
  console.log("");
}
