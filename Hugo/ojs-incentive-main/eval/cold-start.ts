/**
 * cold-start.ts — Cold-start / newcomer fairness of the reputation (q4) component.
 *
 * Literature-grounded (Gupta et al. 2003; Huang et al. 2020 RepChain; Yang & Chen
 * 2008): the right way to handle cold-start is NOT to privilege newcomers but to
 * keep reputation a LOW-WEIGHT, DECAYING factor over a non-negative zero-floor, so
 * that a newcomer is judged mainly on CURRENT work and can reach parity quickly,
 * while starting at q4=0 keeps the system Sybil/whitewashing resistant.
 *
 * Setup: 4 reviewers over N cycles. q4 = accumulated non-transferable SBT (grows by
 * the sigmoid value each active cycle). A newcomer starts at q4=0 with the SAME
 * current quality as an established veteran (isolates the pure cold-start effect);
 * a "declining veteran" has high reputation but low current quality (tests whether
 * stale reputation unfairly protects coasting).
 *
 * Uses the standardized default preset (#2 Balanced, CR=0) via runPipeline.
 * Deterministic, no AI. q2/q3 within the real derived range (PeerRead).
 *
 * Run: npx ts-node eval/cold-start.ts
 */
import { runPipeline } from "./core";

// [q1 days(cost), q2, q3]; q4 accumulates from SBT.
const REVIEWERS = [
  { name: "Veteran-Baik", initSbt: 8, q: [3, 0.78, 0.62] },      // mapan, kualitas kini bagus
  { name: "Pendatang-Baik", initSbt: 0, q: [3, 0.78, 0.62] },    // q4=0, kualitas IDENTIK veteran
  { name: "Veteran-Menurun", initSbt: 8, q: [6, 0.55, 0.25] },   // mapan tapi kualitas kini rendah (coasting)
  { name: "Rata-rata", initSbt: 4, q: [4, 0.67, 0.45] },         // konteks
];
const CYCLES = 10;
const POOL = 2.0;

// Editorial presets (all CR=0) spanning LOW to HIGH q4 (reputation) weight.
const PRESETS: { label: string; q4w: number; bwm: any }[] = [
  { label: "Speed-First (q4=0.09)", q4w: 0.09, bwm: { bestIndex: 0, worstIndex: 3, bestToOthers: [1, 3, 3, 6], othersToWorst: [6, 2, 2, 1] } },
  { label: "Balanced (q4=0.11)", q4w: 0.11, bwm: { bestIndex: 2, worstIndex: 3, bestToOthers: [2, 2, 1, 4], othersToWorst: [2, 2, 4, 1] } },
  { label: "Reputation-First (q4=0.53)", q4w: 0.53, bwm: { bestIndex: 3, worstIndex: 0, bestToOthers: [8, 4, 2, 1], othersToWorst: [1, 2, 4, 8] } },
];

function simulate(bwm?: any) {
  const sbt = REVIEWERS.map((r) => r.initSbt);
  const traj: { c: number; reward: number[]; q4: number[] }[] = [];
  for (let c = 1; c <= CYCLES; c++) {
    const matrix = REVIEWERS.map((r, i) => [r.q[0], r.q[1], r.q[2], sbt[i]]);
    const res = runPipeline(matrix, bwm ? { pool: POOL, bwm } : { pool: POOL });
    traj.push({ c, reward: [...res.rewards], q4: [...sbt] });
    REVIEWERS.forEach((_, i) => (sbt[i] += res.sigmoidValues[i]));
  }
  return traj;
}

function main() {
  const vbIdx = 0, pbIdx = 1, vmIdx = 2;
  const traj = simulate();

  // cycles-to-parity: first cycle where Pendatang-Baik reward >= 95% of Veteran-Baik
  let parityCycle = -1;
  for (const t of traj) {
    if (t.reward[pbIdx] >= 0.95 * t.reward[vbIdx]) { parityCycle = t.c; break; }
  }

  console.log(`\n=== Cold-start: Pendatang-Baik (q4=0) vs Veteran-Baik (kualitas identik) ===`);
  console.log("Siklus  VB-imbalan  PB-imbalan  PB/VB   VM-imbalan   q4(VB)  q4(PB)");
  for (const t of traj) {
    const ratio = (t.reward[pbIdx] / t.reward[vbIdx] * 100).toFixed(0);
    console.log(
      `  ${String(t.c).padStart(2)}     ${t.reward[vbIdx].toFixed(3)}      ${t.reward[pbIdx].toFixed(3)}      ${ratio}%    ${t.reward[vmIdx].toFixed(3)}       ${t.q4[vbIdx].toFixed(1)}    ${t.q4[pbIdx].toFixed(1)}`
    );
  }
  const c1 = traj[0], cN = traj[CYCLES - 1];
  console.log(`\nSiklus 1  : Pendatang-Baik memperoleh ${(c1.reward[pbIdx] / c1.reward[vbIdx] * 100).toFixed(0)}% dari imbalan Veteran-Baik (meski q4=0).`);
  console.log(`Siklus ${CYCLES} : ${(cN.reward[pbIdx] / cN.reward[vbIdx] * 100).toFixed(0)}% dari Veteran-Baik.`);
  console.log(`Siklus-sampai-setara (>=95% VB): ${parityCycle > 0 ? "siklus " + parityCycle : "belum dalam " + CYCLES + " siklus"}.`);
  // Veteran-Menurun overtaken by Pendatang-Baik?
  const vmOvertaken = traj.find((t) => t.reward[pbIdx] > t.reward[vmIdx]);
  console.log(`Veteran-Menurun (coasting) disalip Pendatang-Baik: ${vmOvertaken ? "sejak siklus " + vmOvertaken.c : "tidak"}.`);

  // ---- Sweep preset: penalti pendatang vs bobot reputasi q4 ----
  console.log(`\n=== Penalti pendatang vs bobot reputasi (q4) ===`);
  console.log("Preset                        PB/VB siklus-1   PB/VB siklus-10   VM disalip");
  for (const p of PRESETS) {
    const tj = simulate(p.bwm);
    const r1 = (tj[0].reward[pbIdx] / tj[0].reward[vbIdx] * 100).toFixed(0);
    const rN = (tj[CYCLES - 1].reward[pbIdx] / tj[CYCLES - 1].reward[vbIdx] * 100).toFixed(0);
    const vm = tj.find((t) => t.reward[pbIdx] > t.reward[vmIdx]);
    console.log(`${p.label.padEnd(28)} ${r1.padStart(6)}%          ${rN.padStart(6)}%           ${vm ? "siklus " + vm.c : "tidak"}`);
  }
  console.log("");
}

main();
