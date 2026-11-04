/**
 * sliding-window-compare.ts — Off-chain comparison of two reputation (q4) decay
 * models, WITHOUT changing the deployed mechanism. Decides whether a sliding-window
 * reputation (RepChain-style: only the last W cycles count) is worth adopting as
 * future work.
 *
 *   (A) Cumulative (current thesis model): q4 = running SBT total; decays only on
 *       INACTIVITY. Active veterans accumulate without bound.
 *   (B) Sliding-window (W cycles): q4 = sum of the last W cycle-contributions; old
 *       contributions age out even while active (Huang et al. 2020, RepChain).
 *
 * Only MULTI-CYCLE evaluations are affected (cold-start, decay). Single-batch
 * evaluations (free-riding, Sybil, robustness, gaming, F7) use q4 as a fixed input
 * and are UNCHANGED by the decay model. Deterministic, no AI, preset #2.
 *
 * Run: npx ts-node eval/sliding-window-compare.ts
 */
import { runPipeline } from "./core";

const POOL = 2.0;
const W = 5; // sliding window length (cycles)
const GOOD = 0.85; // representative per-cycle contribution of a good reviewer

type Mode = "cumulative" | "sliding";

// ---------- Scenario 1: cold-start ----------
const CS = [
  { name: "Veteran-Baik", q: [3, 0.78, 0.62], initCumul: 8, initHist: [GOOD, GOOD, GOOD, GOOD, GOOD] },
  { name: "Pendatang-Baik", q: [3, 0.78, 0.62], initCumul: 0, initHist: [] },
  { name: "Veteran-Menurun", q: [6, 0.55, 0.25], initCumul: 8, initHist: [GOOD, GOOD, GOOD, GOOD, GOOD] },
  { name: "Rata-rata", q: [4, 0.67, 0.45], initCumul: 4, initHist: [0.5, 0.5, 0.5, 0.5, 0.5] },
];

function coldStart(mode: Mode) {
  const cumul = CS.map((r) => r.initCumul);
  const hist = CS.map((r) => [...r.initHist]);
  const cycles = 10;
  const traj: { reward: number[] }[] = [];
  for (let c = 1; c <= cycles; c++) {
    const q4 = CS.map((r, i) => (mode === "cumulative" ? cumul[i] : hist[i].slice(-W).reduce((s, v) => s + v, 0)));
    const res = runPipeline(CS.map((r, i) => [r.q[0], r.q[1], r.q[2], q4[i]]), { pool: POOL });
    traj.push({ reward: [...res.rewards] });
    CS.forEach((_, i) => { cumul[i] += res.sigmoidValues[i]; hist[i].push(res.sigmoidValues[i]); });
  }
  return traj;
}

// ---------- Scenario 2: decay of an inactive reviewer ----------
// Rina: good & active cycles 1-5, then INACTIVE cycles 6-10. Budi: always active.
function decay(mode: Mode) {
  const R = [
    { name: "Rina", q: [3, 0.78, 0.62], initCumul: 5, initHist: [GOOD, GOOD, GOOD, GOOD, GOOD] },
    { name: "Budi", q: [3, 0.76, 0.60], initCumul: 5, initHist: [GOOD, GOOD, GOOD, GOOD, GOOD] },
    { name: "Ana", q: [4, 0.67, 0.45], initCumul: 3, initHist: [0.5, 0.5, 0.5, 0.5, 0.5] },
  ];
  const cumul = R.map((r) => r.initCumul);
  const hist = R.map((r) => [...r.initHist]);
  const cycles = 10;
  const perCycleInactivityDecay = Math.pow(1 - 0.02, 30); // 30 days between cycles, lambda=0.02/day
  const q4Rina: number[] = [];
  for (let c = 1; c <= cycles; c++) {
    const rinaActive = c <= 5;
    const q4 = R.map((r, i) => (mode === "cumulative" ? cumul[i] : hist[i].slice(-W).reduce((s, v) => s + v, 0)));
    q4Rina.push(q4[0]);
    // (we do not need the reward here, only the q4 trajectory of Rina)
    // update: active reviewers contribute a good value; Rina contributes 0 when inactive
    R.forEach((_, i) => {
      const active = i === 0 ? rinaActive : true;
      const contrib = active ? GOOD : 0;
      if (mode === "cumulative") {
        cumul[i] = active ? cumul[i] + contrib : cumul[i] * perCycleInactivityDecay; // inactivity decay
      } else {
        hist[i].push(contrib); // sliding window: append 0 when inactive -> window empties
      }
    });
  }
  return q4Rina;
}

function main() {
  console.log(`\n=== Perbandingan model reputasi: Kumulatif (sekarang) vs Sliding-window (W=${W}) ===`);

  // Scenario 1
  const cumCS = coldStart("cumulative");
  const swCS = coldStart("sliding");
  const ratio = (t: { reward: number[] }) => t.reward[1] / t.reward[0] * 100; // Pendatang/Veteran
  const parity = (traj: { reward: number[] }[]) => {
    const idx = traj.findIndex((t) => t.reward[1] >= 0.95 * t.reward[0]);
    return idx >= 0 ? idx + 1 : -1;
  };
  console.log(`\n[Cold-start] Rasio imbalan Pendatang-Baik / Veteran-Baik (kualitas identik):`);
  console.log("Siklus       " + Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(5)).join(""));
  console.log("Kumulatif    " + cumCS.map((t) => (ratio(t).toFixed(0) + "%").padStart(5)).join(""));
  console.log("Sliding-win  " + swCS.map((t) => (ratio(t).toFixed(0) + "%").padStart(5)).join(""));
  const pc = parity(cumCS), ps = parity(swCS);
  console.log(`Siklus-sampai-setara (>=95%): Kumulatif ${pc > 0 ? pc : ">10"},  Sliding-window ${ps > 0 ? ps : ">10"}`);

  // Scenario 2
  const cumD = decay("cumulative");
  const swD = decay("sliding");
  const norm = (arr: number[]) => arr.map((v) => v / arr[0]); // relative to cycle-1 reputation
  console.log(`\n[Decay] Reputasi Rina (aktif siklus 1-5, INAKTIF 6-10), relatif ke siklus 1:`);
  console.log("Siklus       " + Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(5)).join(""));
  console.log("Kumulatif    " + norm(cumD).map((v) => v.toFixed(2).padStart(5)).join(""));
  console.log("Sliding-win  " + norm(swD).map((v) => v.toFixed(2).padStart(5)).join(""));
  console.log("");
  console.log("Catatan: eval batch-tunggal (free-riding, Sybil, robustness, gaming, F7) TIDAK terpengaruh (q4 = input tetap).");
  console.log("");
}

main();
