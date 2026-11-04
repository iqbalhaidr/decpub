/**
 * derive-qos.ts — Derive REAL q2 (relevance) and q3 (actionability) from real
 * peer reviews (PeerRead, ICLR 2017) using the SAME inference-only model that the
 * production middleware uses (LocalModelProvider, Xenova/all-MiniLM-L6-v2).
 *
 * Purpose (thesis Bab IV): replace hand-crafted synthetic q2/q3 numbers with
 * values derived from genuine reviews, and produce the data needed to VALIDATE
 * the metrics:
 *   - q2_own    = relevance(review, its OWN paper abstract)
 *   - q2_random = relevance(review, a DIFFERENT paper's abstract)   [discriminant test]
 *   - q3        = actionability(review)
 *
 * Human labels from PeerRead (rec, confidence, aspect scores) are carried through
 * UNCHANGED for the validation analysis. NOTE: those labels rate the PAPER, not the
 * review; they are used only as secondary/indicative signals, not as ground truth
 * for review quality (see validate step).
 *
 * Input  : JSON array of {paper_id, review_idx, abstract, comments, rec, conf, ...}
 * Output : same records + {q2_own, q2_random, q3}
 *
 * Run: npx ts-node eval/realdata/derive-qos.ts <input.json> <output.json> [sampleN]
 * Deterministic: fixed hash-based sampling + fixed random-pairing rotation, so a
 * given (input, sampleN) always yields the same subset and the same numbers.
 */
import * as fs from "fs";
import * as crypto from "crypto";
import { createProvider } from "../../middleware/qos";

type Rec = {
  paper_id: string; review_idx: number; abstract: string; comments: string;
  rec: number | null; conf: number | null;
  originality: number | null; soundness: number | null;
  clarity: number | null; comparison: number | null; accepted: boolean;
};

async function main() {
  const [, , inPath, outPath, sampleArg] = process.argv;
  if (!inPath || !outPath) {
    console.error("usage: ts-node derive-qos.ts <input.json> <output.json> [sampleN]");
    process.exit(1);
  }
  const sampleN = sampleArg ? parseInt(sampleArg, 10) : 600;

  const all: Rec[] = JSON.parse(fs.readFileSync(inPath, "utf8"));
  // Deterministic "random" order: sort by SHA1(paper_id:review_idx). Reproducible.
  const keyed = all
    .map((r) => ({ r, h: crypto.createHash("sha1").update(`${r.paper_id}:${r.review_idx}`).digest("hex") }))
    .sort((a, b) => (a.h < b.h ? -1 : 1))
    .map((x) => x.r);
  const sample = keyed.slice(0, Math.min(sampleN, keyed.length));
  console.log(`loaded ${all.length} records; deriving on fixed sample of ${sample.length}`);

  const provider = await createProvider("local");
  console.log(`provider: ${provider.name}`);

  // Random-paper pairing for the q2 discriminant test: pair review i with a paper
  // half the list away, probing forward until a DIFFERENT paper_id is found.
  const N = sample.length;
  const randAbstractFor = (i: number): string => {
    for (let step = 0; step < N; step++) {
      const j = (i + Math.floor(N / 2) + step) % N;
      if (sample[j].paper_id !== sample[i].paper_id) return sample[j].abstract;
    }
    return sample[(i + 1) % N].abstract;
  };

  const out: any[] = [];
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const r = sample[i];
    const q2_own = await provider.relevance(r.comments, r.abstract);
    const q2_random = await provider.relevance(r.comments, randAbstractFor(i));
    const q3 = await provider.actionability(r.comments);
    out.push({
      paper_id: r.paper_id, review_idx: r.review_idx,
      comments_len: r.comments.length,
      q2_own, q2_random, q3,
      rec: r.rec, conf: r.conf,
      originality: r.originality, soundness: r.soundness,
      clarity: r.clarity, comparison: r.comparison, accepted: r.accepted,
    });
    if ((i + 1) % 25 === 0 || i === N - 1) {
      const rate = (i + 1) / ((Date.now() - t0) / 1000);
      console.log(`  ${i + 1}/${N}  (${rate.toFixed(1)}/s)`);
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`saved ${out.length} derived records -> ${outPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
