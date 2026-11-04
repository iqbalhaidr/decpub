/**
 * validate.ts — Validation analysis for the derived real q2/q3 (thesis Bab IV).
 *
 * Reads the output of derive-qos.ts and reports:
 *   1. q2 DISCRIMINANT test (primary, rigorous): a review should be more relevant
 *      to its OWN paper than to a random other paper. Reports mean q2_own vs
 *      q2_random, paired mean difference, Cohen's d (paired), and % own>random.
 *   2. q3 distribution + Spearman(q3, review length) — a construct check that
 *      actionability tracks review substance rather than being flat/degenerate.
 *   3. Secondary (indicative, with caveat): Spearman of q2_own/q3 vs REVIEWER
 *      CONFIDENCE and vs RECOMMENDATION. NOTE: rec/aspect labels rate the PAPER,
 *      not the review, so these are reported as indicative only, NOT as ground truth.
 *
 * Run: npx ts-node eval/realdata/validate.ts <derived.json>
 */
import * as fs from "fs";

type D = {
  q2_own: number; q2_random: number; q3: number; comments_len: number;
  rec: number | null; conf: number | null;
};

function mean(a: number[]): number { return a.reduce((x, y) => x + y, 0) / a.length; }
function std(a: number[]): number { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); }

// Average-rank (handles ties) for Spearman.
function ranks(a: number[]): number[] {
  const idx = a.map((v, i) => [v, i] as [number, number]).sort((x, y) => x[0] - y[0]);
  const r = new Array(a.length).fill(0);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1; // 1-based average rank
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}
function pearson(a: number[], b: number[]): number {
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}
function spearman(a: number[], b: number[]): number { return pearson(ranks(a), ranks(b)); }

function pct(a: number[], p: number): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

function main() {
  const path = process.argv[2];
  if (!path) { console.error("usage: ts-node validate.ts <derived.json>"); process.exit(1); }
  const data: D[] = JSON.parse(fs.readFileSync(path, "utf8"));
  const N = data.length;
  console.log(`\n=== Validasi q2/q3 pada ${N} ulasan nyata (PeerRead ICLR 2017) ===\n`);

  // --- 1. q2 discriminant ---
  const own = data.map((d) => d.q2_own);
  const rnd = data.map((d) => d.q2_random);
  const diff = data.map((d) => d.q2_own - d.q2_random);
  const dPaired = mean(diff) / std(diff); // Cohen's d (paired)
  const winRate = data.filter((d) => d.q2_own > d.q2_random).length / N;
  console.log("[1] q2 DISKRIMINAN (relevansi ke paper sendiri vs paper acak):");
  console.log(`    mean q2_own    = ${mean(own).toFixed(4)}  (sd ${std(own).toFixed(4)})`);
  console.log(`    mean q2_random = ${mean(rnd).toFixed(4)}  (sd ${std(rnd).toFixed(4)})`);
  console.log(`    selisih rata2  = ${mean(diff).toFixed(4)}   Cohen's d (paired) = ${dPaired.toFixed(3)}`);
  console.log(`    % own > random = ${(winRate * 100).toFixed(1)}%`);

  // --- 2. q3 distribution + tracks length ---
  const q3 = data.map((d) => d.q3);
  const len = data.map((d) => d.comments_len);
  console.log("\n[2] q3 ACTIONABILITY (sebaran + hubungan dengan panjang ulasan):");
  console.log(`    mean ${mean(q3).toFixed(4)}  sd ${std(q3).toFixed(4)}  min ${Math.min(...q3).toFixed(3)}  max ${Math.max(...q3).toFixed(3)}`);
  console.log(`    p10 ${pct(q3, 0.1).toFixed(3)}  p50 ${pct(q3, 0.5).toFixed(3)}  p90 ${pct(q3, 0.9).toFixed(3)}`);
  console.log(`    Spearman(q3, panjang ulasan) = ${spearman(q3, len).toFixed(3)}`);

  // q2_own distribution too
  console.log("\n    q2_own sebaran: p10 " + pct(own, 0.1).toFixed(3) + "  p50 " + pct(own, 0.5).toFixed(3) + "  p90 " + pct(own, 0.9).toFixed(3));

  // --- 3. Secondary indicative correlations ---
  const withConf = data.filter((d) => d.conf != null);
  const withRec = data.filter((d) => d.rec != null);
  console.log("\n[3] Korelasi SEKUNDER (INDIKATIF; label menilai PAPER, bukan ulasan):");
  if (withConf.length > 10) {
    console.log(`    Spearman(q2_own, confidence) = ${spearman(withConf.map((d) => d.q2_own), withConf.map((d) => d.conf!)).toFixed(3)}  (n=${withConf.length})`);
    console.log(`    Spearman(q3,     confidence) = ${spearman(withConf.map((d) => d.q3), withConf.map((d) => d.conf!)).toFixed(3)}`);
  }
  if (withRec.length > 10) {
    console.log(`    Spearman(q2_own, recommendation) = ${spearman(withRec.map((d) => d.q2_own), withRec.map((d) => d.rec!)).toFixed(3)}  (n=${withRec.length})`);
    console.log(`    Spearman(q3,     recommendation) = ${spearman(withRec.map((d) => d.q3), withRec.map((d) => d.rec!)).toFixed(3)}`);
  }
  console.log("");
}

main();
