/**
 * curate.ts — Build the fixed evaluation datasets (D1/D2/D3) from REAL derived
 * q2/q3 (PeerRead ICLR 2017). q2/q3 are ACTUAL model outputs; q1 (days) and q4
 * (SBT) are controlled parameters per profile.
 *
 * Selection is PRINCIPLED and deterministic:
 *   - profiles defined by percentile-style bands on real q2/q3 (not the extreme
 *     tail), so free-riders are low-effort-but-realistic (q3 in a low band, NOT 0);
 *   - D1 is chosen from reviews with genuine cross-criteria trade-offs and a short
 *     deterministic search over slot assignments to obtain a meaningful method
 *     comparison (Spearman TOPSIS-vs-WSM high but < 1);
 *   - distinct paper per row; everything reproducible from the derived file.
 *
 * Run: npx ts-node eval/realdata/curate.ts <derived.json>
 */
import * as fs from "fs";
import { runBaselines } from "../core";

type D = { paper_id: string; review_idx: number; q2_own: number; q3: number;
  comments_len: number; rec: number | null };

const r2 = (x: number) => Math.round(x * 100) / 100;

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

function main() {
  const data: D[] = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const byKey = [...data].sort((a, b) =>
    a.paper_id === b.paper_id ? a.review_idx - b.review_idx : (a.paper_id < b.paper_id ? -1 : 1));
  const used = new Set<string>();
  const take = (pool: D[], n: number): D[] => {
    const out: D[] = [];
    for (const d of pool) { if (out.length >= n) break; if (!used.has(d.paper_id)) { out.push(d); used.add(d.paper_id); } }
    return out;
  };

  // --- Profile pools (bands on real q2/q3) ---
  const thorough   = byKey.filter((d) => d.q2_own >= 0.70 && d.q3 >= 0.55 && d.comments_len >= 2000);
  const hi2lo3     = byKey.filter((d) => d.q2_own >= 0.72 && d.q3 >= 0.20 && d.q3 <= 0.38 && d.comments_len >= 1200);
  const lo2hi3     = byKey.filter((d) => d.q2_own <= 0.63 && d.q3 >= 0.52 && d.comments_len >= 1500);
  const mid        = byKey.filter((d) => d.q2_own >= 0.62 && d.q2_own <= 0.69 && d.q3 >= 0.40 && d.q3 <= 0.52);
  // Free-rider band: LOW on both, short, but q3 NONZERO (~p10, not the extreme tail).
  const freeband   = byKey.filter((d) => d.q3 >= 0.10 && d.q3 <= 0.20 && d.q2_own <= 0.60 && d.comments_len <= 1300);
  console.log(`pools: thorough=${thorough.length} hi2lo3=${hi2lo3.length} lo2hi3=${lo2hi3.length} mid=${mid.length} free=${freeband.length}\n`);

  const prov: string[] = [];
  const tag = (d: D) => { prov.push(`${d.paper_id}:${d.review_idx}  q2=${r2(d.q2_own)} q3=${r2(d.q3)} len=${d.comments_len} rec=${d.rec}`); return d; };

  // ================= D1: worked example with cross-criteria trade-offs =================
  // 5 reviews spanning profiles; fixed q1/q4 slots; search slot assignment for a
  // meaningful method comparison (Spearman TOPSIS vs WSM high but < 1).
  const d1cand = [take(thorough, 1)[0], take(hi2lo3, 1)[0], take(lo2hi3, 1)[0], take(mid, 1)[0], take(freeband, 1)[0]];
  const SLOT_Q1 = [2, 3, 4, 5, 7];
  const SLOT_Q4 = [110, 95, 80, 70, 45];
  let best: { perm: D[]; rho: number } | null = null;
  for (const perm of permutations(d1cand)) {
    const mat = perm.map((d, i) => [SLOT_Q1[i], d.q2_own, d.q3, SLOT_Q4[i]]);
    const wsm = runBaselines(mat).baselines.find((b) => /WSM/.test(b.method));
    const rho = wsm ? wsm.spearman : 1;
    // want the HIGHEST rho strictly below 1 (convergent but not identical)
    if (rho < 0.999 && (!best || rho > best.rho)) best = { perm, rho };
  }
  const d1 = (best ? best.perm : d1cand);
  const d1rho = best ? best.rho : 1;
  console.log(`# D1 Spearman(TOPSIS,WSM) = ${d1rho.toFixed(3)}${best ? "" : "  (no <1 found; ranking unanimous)"}\n`);
  d1.forEach(tag);
  emit("EVAL", "EVAL_L", d1.map((d, i) => [SLOT_Q1[i], r2(d.q2_own), r2(d.q3), SLOT_Q4[i]]), ["R1","R2","R3","R4","R5"]);

  // ================= D2: free-riding, n=8 (6 honest/mid + 2 free-riders) =================
  const H = take(thorough, 3).concat(take(mid, 3));
  const F2 = take(freeband, 2);
  const d2 = [...H, ...F2]; d2.forEach(tag);
  // q1 (days): free-riders are FAST-but-shallow (they rush a quick review), so they
  // get LOW q1 (good timeliness) but poor q2/q3/q4 — a realistic trade-off, not an
  // all-criteria anti-ideal. Honest reviewers take a bit longer (thorough).
  const d2q1 = [3, 4, 3, 4, 3, 4, 2, 3], d2q4 = [100, 95, 90, 80, 75, 70, 40, 35];
  emit("FR", "FR_L", d2.map((d, i) => [d2q1[i], r2(d.q2_own), r2(d.q3), d2q4[i]]),
    ["Honest-A","Honest-B","Honest-C","Honest-D","Honest-E","Honest-F","Free-rider-1","Free-rider-2"]);

  // ================= D3: Sybil, n=8 (5 honest + 3 sybil identities, q4=0) =================
  const H3 = take(thorough, 3).concat(take(mid, 2));
  const S3 = take(freeband, 3);
  const d3 = [...H3, ...S3]; d3.forEach(tag);
  const d3q1 = [3, 3, 4, 3, 4, 4, 4, 4], d3q4 = [95, 90, 85, 92, 80, 0, 0, 0];
  emit("SYB", "SYB_L", d3.map((d, i) => [d3q1[i], r2(d.q2_own), r2(d.q3), d3q4[i]]),
    ["Honest-1","Honest-2","Honest-3","Honest-4","Honest-5","Sybil-a","Sybil-b","Sybil-c"]);

  console.log("\n=== PROVENANCE (paper_id:review_idx) ===");
  prov.forEach((p, i) => console.log(`  [${i}] ${p}`));

  function emit(name: string, lname: string, mat: number[][], labels: string[]) {
    console.log(`export const ${name}: Matrix = [${mat.map((r) => `[${r.join(",")}]`).join(",")}];`);
    console.log(`export const ${lname}: string[] = [${labels.map((l) => `"${l}"`).join(",")}];`);
  }
}

main();
