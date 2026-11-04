/**
 * eval/worked-example.ts — dumps every intermediate step of the MCDM pipeline
 * on dataset D1 (default config: lambda=0.6, gamma=0.5, k=10, x0=0.5, pool=2 ETH)
 * for the step-by-step worked example in the thesis appendix.
 *
 * Run: npx ts-node eval/worked-example.ts
 */

import { EVAL, EVAL_L, PRESETS } from "../frontend/config/eval-datasets";
import { normalize, computeBWM, computeECWM, fuseWeights, topsis, distribute } from "../middleware";
import { CRITERIA_TYPES } from "./core";

const r = (x: number, d = 4) => x.toFixed(d);
const row = (a: number[], d = 4) => a.map((v) => r(v, d)).join(" & ");

// Worked example uses the consistent "Balanced" editorial preset (CR=0,
// see IV.3.1) so the example is internally coherent and self-verifiable.
const P = PRESETS["Balanced"];
const normalized = normalize(EVAL, CRITERIA_TYPES);
const bwm = computeBWM({ bestIndex: P.best, worstIndex: P.worst, bestToOthers: P.bo, othersToWorst: P.ow });
const ecwm = computeECWM(normalized, 0.5);
const fused = fuseWeights(bwm.weights, ecwm, 0.6);
const t = topsis(normalized, fused, CRITERIA_TYPES);
const dist = distribute(t.scores, 2.0, { k: 10, x0: 0.5 });

console.log("\n# Raw D1 (q1 days[cost], q2, q3, q4 SBT)");
EVAL.forEach((rw, i) => console.log(`${EVAL_L[i]} & ${row(rw, 2)}`));

console.log("\n# Normalized (linear; q1=cost)");
normalized.forEach((rw, i) => console.log(`${EVAL_L[i]} & ${row(rw)}`));

console.log("\n# BWM weights (consistencyRatio=" + r(bwm.consistencyRatio) + ")");
console.log(row(bwm.weights));
console.log("\n# ECWM weights (gamma=0.5)");
console.log(row(ecwm));
console.log("\n# Fused weights (lambda=0.6)");
console.log(row(fused));

console.log("\n# TOPSIS scores S_i & ranking");
EVAL_L.forEach((l, i) => console.log(`${l} & ${r(t.scores[i])}`));
console.log("ranking (best->worst index): " + t.ranking.join(", "));

console.log("\n# Sigmoid value, share, reward (pool=2 ETH)");
EVAL_L.forEach((l, i) => console.log(`${l} & ${r(dist.sigmoidValues[i])} & ${r(dist.shares[i])} & ${r(dist.rewards[i])}`));
console.log("sum rewards = " + r(dist.rewards.reduce((a, b) => a + b, 0)));
console.log("");
