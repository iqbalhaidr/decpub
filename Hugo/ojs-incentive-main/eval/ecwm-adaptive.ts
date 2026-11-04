/**
 * eval/ecwm-adaptive.ts — IV.3.4 (NFR-06)
 *
 * Demonstrates that the objective weighting component (ECWM) adapts to the
 * per-batch data spread: a criterion with no variance across reviewers loses
 * all discriminating power and ECWM drives its weight to zero, redistributing
 * it to the informative criteria.
 *
 * Batch 1 = D1 baseline (all criteria vary).
 * Batch 2 = q1 (timeliness) uniform across reviewers.
 * Batch 3 = q4 (reputation) uniform across reviewers.
 *
 * Run: npx ts-node eval/ecwm-adaptive.ts
 */

import { EVAL } from "../frontend/config/eval-datasets";
import { normalize, computeECWM } from "../middleware";
import { CRITERIA_TYPES } from "./core";

const GAMMA = 0.5;
// Constant fill values for the flattened column. The exact constant is
// irrelevant — a zero-variance column always yields weight 0 — but we fix it
// for reproducibility.
const Q1_CONST = 4; // days
const Q4_CONST = 80; // SBT balance

export interface EcwmBatch {
  label: string;
  weights: number[]; // [w_q1, w_q2, w_q3, w_q4]
}

export function runEcwmAdaptive(): EcwmBatch[] {
  const clean = (w: number[]) => w.map((x) => (Math.abs(x) < 1e-9 ? 0 : x));
  const weightsOf = (m: number[][]) => clean(computeECWM(normalize(m, CRITERIA_TYPES), GAMMA));

  const batch1 = EVAL;
  const batch2 = EVAL.map((r) => [Q1_CONST, r[1], r[2], r[3]]); // q1 uniform
  const batch3 = EVAL.map((r) => [r[0], r[1], r[2], Q4_CONST]); // q4 uniform

  return [
    { label: "1 — Baseline (D1)", weights: weightsOf(batch1) },
    { label: "2 — q1 seragam", weights: weightsOf(batch2) },
    { label: "3 — q4 seragam", weights: weightsOf(batch3) },
  ];
}

if (require.main === module) {
  const rows = runEcwmAdaptive();
  console.log("\n=== IV.3.4 — ECWM adaptif lintas batch (gamma=0.5) ===");
  console.log("  Batch                w_q1     w_q2     w_q3     w_q4");
  for (const r of rows) {
    const w = r.weights.map((x) => x.toFixed(3).padStart(7)).join(" ");
    console.log(`  ${r.label.padEnd(20)} ${w}`);
  }
  console.log("");
}
