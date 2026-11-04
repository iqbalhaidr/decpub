/**
 * discriminant-q2q3.ts — F4 (PDF Sec 6.4 / NFR-Q04): discriminant validity of q2 vs q3.
 *
 * Proves q2 (relevance) and q3 (actionability) measure DIFFERENT constructs (not
 * redundant) by computing their correlation over the real derived PeerRead sample.
 * A near-zero correlation means knowing q2 tells you nothing about q3, so each
 * criterion carries unique information (justifies the 4-criteria design and supports
 * the metric-gaming defence: attacking one metric does not move the other).
 *
 * Reads only the committed derived numbers (no raw review text). Deterministic.
 *
 * Run: npx ts-node eval/realdata/discriminant-q2q3.ts [derived.json]
 */
import * as fs from "fs";

const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length;
const std = (x: number[], m: number) => Math.sqrt(x.reduce((s, v) => s + (v - m) * (v - m), 0) / x.length);

function pearson(a: number[], b: number[]): number {
  const n = a.length, ma = mean(a), mb = mean(b), sa = std(a, ma), sb = std(b, mb);
  let cov = 0;
  for (let i = 0; i < n; i++) cov += (a[i] - ma) * (b[i] - mb);
  cov /= n;
  return cov / (sa * sb);
}

function rank(x: number[]): number[] {
  const idx = x.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
  const r = new Array(x.length);
  idx.forEach((p, k) => (r[p[1]] = k + 1));
  return r;
}

function median(x: number[]): number {
  const s = [...x].sort((p, q) => p - q);
  return s[Math.floor(s.length / 2)];
}

function main() {
  const inPath = process.argv[2] || "eval/realdata/peerread-iclr2017-derived.json";
  const a = JSON.parse(fs.readFileSync(inPath, "utf8"));
  const q2 = a.map((r: any) => r.q2_own);
  const q3 = a.map((r: any) => r.q3);
  const n = a.length;

  const r = pearson(q2, q3);
  const rho = pearson(rank(q2), rank(q3));
  const md2 = median(q2), md3 = median(q3);
  let hh = 0, hl = 0, lh = 0, ll = 0;
  for (let i = 0; i < n; i++) {
    const h2 = q2[i] >= md2, h3 = q3[i] >= md3;
    if (h2 && h3) hh++; else if (h2 && !h3) hl++; else if (!h2 && h3) lh++; else ll++;
  }

  console.log(`\n=== F4 — Validitas Diskriminan q2 vs q3 (n=${n} ulasan nyata) ===`);
  console.log(`q2 relevansi : mean=${mean(q2).toFixed(3)}  std=${std(q2, mean(q2)).toFixed(3)}`);
  console.log(`q3 actionability: mean=${mean(q3).toFixed(3)}  std=${std(q3, mean(q3)).toFixed(3)}`);
  console.log(`Pearson  r(q2,q3)   = ${r.toFixed(3)}`);
  console.log(`Spearman rho(q2,q3) = ${rho.toFixed(3)}`);
  console.log(`r^2 (varians bersama) = ${(r * r * 100).toFixed(1)}%`);
  console.log(`Kuadran (relatif median):`);
  console.log(`  q2-tinggi & q3-tinggi = ${hh}    q2-tinggi & q3-rendah = ${hl}`);
  console.log(`  q2-rendah & q3-tinggi = ${lh}    q2-rendah & q3-rendah = ${ll}`);
  console.log(`Interpretasi: korelasi ~0 -> q2 dan q3 independen -> tidak redundan.\n`);
}

main();
