/**
 * eval/verify-existing.ts
 *
 * Regenerates the SIX tables already wired into the frontend demo
 * (frontend/evaluation.ts) using the shared core, and prints them so the
 * numbers can be compared against the thesis (Bab IV):
 *   IV.3.1 CR per preset
 *   IV.3.2 Spearman vs baselines
 *   IV.3.3 Sensitivity lambda
 *   IV.4.1 Free-riding (sigmoid vs linear)
 *   IV.4.2 Sybil
 *   IV.4.3 Decay multicycle
 *
 * Run: npx ts-node eval/verify-existing.ts
 */

import { EVAL, EVAL_L, FR, FR_L, SYB, SYB_L, PRESETS } from "../frontend/config/eval-datasets";
import { runPipeline, runBaselines, runMulticycle } from "./core";

const f = (x: number, d = 3) => x.toFixed(d);
const bwmOf = (p: any) => ({ bestIndex: p.best, worstIndex: p.worst, bestToOthers: p.bo, othersToWorst: p.ow });

console.log("\n================ IV.3.1 — CR per preset (D1) ================");
for (const name in PRESETS) {
  const d = runPipeline(EVAL, { bwm: bwmOf(PRESETS[name]) });
  console.log(`  ${name.padEnd(22)} CR = ${f(d.bwmCR, 3)}`);
}

console.log("\n================ IV.3.2 — Spearman vs Hybrid (D1) ================");
{
  const d = runBaselines(EVAL);
  console.log("  Hybrid (acuan)        rho = 1.000");
  d.baselines.forEach((b) => console.log(`  ${b.method.padEnd(22)} rho = ${f(b.spearman, 3)}`));
}

console.log("\n================ IV.3.3 — Sensitivity lambda (D1) ================");
console.log("  lambda  " + EVAL_L.map((l) => l.padStart(7)).join("") + "   winner");
for (const lam of [0, 0.3, 0.5, 0.6, 0.7, 1.0]) {
  const d = runPipeline(EVAL, { lambda: lam });
  const scores = d.topsisScores.map((s) => f(s, 3).padStart(7)).join("");
  console.log(`  ${lam.toFixed(1).padStart(5)} ${scores}   ${EVAL_L[d.ranking[0]]}`);
}

console.log("\n================ IV.4.1 — Free-riding: sigmoid vs linear (D2) ================");
{
  const d = runBaselines(FR);
  const sig = d.hybrid.rewards;
  const lin = (d.baselines.find((b) => /Linear/.test(b.method)) || ({} as any)).rewards || [];
  FR_L.forEach((l, i) => console.log(`  ${l.padEnd(12)} sigmoid=${f(sig[i], 4)}  linear=${f(lin[i], 4)}`));
  // Handle one OR many free-riders: average honest vs average free-rider.
  const frIdx = FR_L.map((l, i) => (/Free/.test(l) ? i : -1)).filter((i) => i >= 0);
  const avgHonest = (arr: number[]) => arr.filter((_, i) => !frIdx.includes(i)).reduce((a, b) => a + b, 0) / (FR_L.length - frIdx.length);
  const avgFR = (arr: number[]) => frIdx.reduce((a, i) => a + arr[i], 0) / frIdx.length;
  console.log(`  ratio honest/FR  sigmoid=${f(avgHonest(sig) / avgFR(sig), 2)}x   linear=${f(avgHonest(lin) / avgFR(lin), 2)}x`);
}

console.log("\n================ IV.4.2 — Sybil (D3) ================");
{
  const d = runPipeline(SYB);
  SYB_L.forEach((l, i) => console.log(`  ${l.padEnd(10)} reward=${f(d.rewards[i], 4)}`));
  const sIdx = SYB_L.map((l, i) => (/Sybil/.test(l) ? i : -1)).filter((i) => i >= 0);
  const hIdx = SYB_L.map((l, i) => (/Honest/.test(l) ? i : -1)).filter((i) => i >= 0);
  const sybilSum = sIdx.reduce((a, i) => a + d.rewards[i], 0);
  const honestAvg = hIdx.reduce((a, i) => a + d.rewards[i], 0) / hIdx.length;
  console.log(`  Sybil total=${f(sybilSum, 4)}  honest avg=${f(honestAvg, 4)}  ROI=${f(sybilSum / honestAvg, 3)}x`);
}

console.log("\n================ IV.4.3 — Decay multicycle (Eve vs Alice) ================");
{
  const d = runMulticycle({ numCycles: 10 });
  const eve = d.reviewerNames.length - 1; // Eve last
  console.log("  cycle   Eve(SBT)   Alice(SBT)   status");
  d.cycles.forEach((c: any) =>
    console.log(`  ${String(c.cycle).padStart(3)}   ${f(c.sbtBalances[eve], 3).padStart(8)}   ${f(c.sbtBalances[0], 3).padStart(9)}   ${c.eveInactive ? "INACTIVE" : "active"}`)
  );
}

console.log("");
