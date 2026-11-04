/**
 * batch-sensitivity.ts — F7 (PDF Sec 6.7 / NFR-Q04): inter-batch comparability.
 *
 * Shows that scores are RELATIVE to batch composition (the "relative review-service
 * QoS within a batch" property from the design chapter, due to min-max normalization).
 * The SAME test review (fixed q1-q4) is placed into several batch compositions of
 * different quality, the real pipeline is run, and the swing of the test review's
 * final TOPSIS score / reward is measured:
 *
 *   BatchSensitivity = max_composition(score) - min_composition(score)
 *
 * No AI needed: q2/q3 of the test review are fixed; only the per-batch normalization
 * (which depends on the other reviewers) changes. Deterministic. Uses the
 * standardized default preset (#2 Balanced, CR=0) via runPipeline.
 *
 * Test-review q2/q3 values lie within the REAL derived range (PeerRead ICLR 2017:
 * honest q2~0.62-0.80, q3~0.40-0.72); q1/q4 are controlled parameters.
 *
 * Run: npx ts-node eval/batch-sensitivity.ts
 */
import { runPipeline } from "./core";

// Batch compositions at different quality LEVELS, each with realistic internal
// spread and some overlap, so a test review is not automatically the exact min/max.
// Row = one accompanying reviewer, [q1 days(cost), q2, q3, q4].
const COMPOSITIONS: { name: string; rows: number[][] }[] = [
  { name: "Kuat", rows: [[2, 0.80, 0.66, 95], [3, 0.76, 0.60, 88], [2, 0.84, 0.70, 100], [4, 0.72, 0.55, 82], [3, 0.78, 0.64, 90]] },
  { name: "Menengah", rows: [[4, 0.68, 0.48, 72], [5, 0.62, 0.40, 65], [4, 0.72, 0.52, 78], [6, 0.58, 0.35, 60], [5, 0.66, 0.46, 70]] },
  { name: "Lemah", rows: [[6, 0.54, 0.24, 48], [7, 0.48, 0.18, 40], [6, 0.58, 0.28, 52], [8, 0.45, 0.14, 38], [7, 0.52, 0.22, 45]] },
  { name: "Campuran", rows: [[2, 0.82, 0.68, 98], [5, 0.64, 0.42, 68], [7, 0.50, 0.18, 42], [4, 0.70, 0.50, 76], [6, 0.55, 0.26, 50]] },
];

// The SAME test review, placed into each composition (fixed q1-q4).
const TEST_REVIEWS: { name: string; row: number[] }[] = [
  { name: "Ulasan-Baik", row: [3, 0.78, 0.62, 88] },
  { name: "Ulasan-Menengah", row: [5, 0.65, 0.44, 70] },
  { name: "Ulasan-Lemah", row: [6, 0.54, 0.26, 50] },
];

const POOL = 2.0;

function main() {
  const results = TEST_REVIEWS.map((t) => {
    const idx = 5; // test review appended last to a composition of 5
    const perComp = COMPOSITIONS.map((c) => {
      const r = runPipeline([...c.rows, t.row], { pool: POOL });
      return { comp: c.name, score: r.topsisScores[idx], reward: r.rewards[idx] };
    });
    const scores = perComp.map((x) => x.score);
    const rewards = perComp.map((x) => x.reward);
    return {
      name: t.name,
      perComp,
      sensScore: Math.max(...scores) - Math.min(...scores),
      sensReward: Math.max(...rewards) - Math.min(...rewards),
      rewardMin: Math.min(...rewards), rewardMax: Math.max(...rewards),
    };
  });

  console.log(`\n=== F7 — Keterbandingan Antar-Batch (sensitivitas antar-batch, pool=${POOL} ETH) ===`);
  console.log("Ulasan uji".padEnd(16) + COMPOSITIONS.map((c) => c.name.padStart(10)).join("") + "   Sens(skor)  Sens(imbalan)");
  for (const r of results) {
    const cells = r.perComp.map((x) => x.score.toFixed(3).padStart(10)).join("");
    console.log(r.name.padEnd(16) + cells + `     ${r.sensScore.toFixed(3)}      ${r.sensReward.toFixed(3)} ETH`);
  }
  console.log("\n--- Imbalan ulasan yang sama, min vs max lintas komposisi batch (share dari pool) ---");
  for (const r of results) {
    const minPct = (r.rewardMin / POOL * 100).toFixed(0);
    const maxPct = (r.rewardMax / POOL * 100).toFixed(0);
    console.log(`${r.name.padEnd(16)} ${r.rewardMin.toFixed(3)} ETH (${minPct}% pool)  ->  ${r.rewardMax.toFixed(3)} ETH (${maxPct}% pool)`);
  }
  console.log("");
}

main();
