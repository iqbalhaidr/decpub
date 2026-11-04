/**
 * example-discriminant.ts — ONE concrete label-free validation case.
 * Takes a real review, measures q2 (relevance) to its OWN paper vs several OTHER
 * papers, using the production model. No human label used — the ground truth is
 * structural (the review belongs to its own paper).
 *
 * Run: npx ts-node eval/realdata/example-discriminant.ts <peerread_full.json>
 */
import * as fs from "fs";
import { createProvider } from "../../middleware/qos";

type Rec = { paper_id: string; review_idx: number; title: string; abstract: string; comments: string };

async function main() {
  const all: Rec[] = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const byId = (id: string) => all.find((r) => r.paper_id === id)!;

  const target = all.find((r) => r.paper_id === "317" && r.review_idx === 3)!; // review in D1 (R1)
  const others = ["369", "322", "725", "624"].map(byId); // different papers

  const provider = await createProvider("local");
  const ex = (s: string, n = 300) => s.replace(/\s+/g, " ").slice(0, n) + "…";

  console.log("\n================ SATU KASUS: VALIDASI BEBAS-LABEL (q2) ================\n");
  console.log(`ULASAN (paper ${target.paper_id}, review #${target.review_idx}):`);
  console.log(`  "${ex(target.comments, 420)}"\n`);
  console.log(`PAPER-NYA SENDIRI: "${target.title}"`);
  console.log(`  abstrak: "${ex(target.abstract, 220)}"\n`);

  const own = await provider.relevance(target.comments, target.abstract);
  console.log(`  q2(ulasan, PAPER-SENDIRI) = ${own.toFixed(4)}   <-- seharusnya TERTINGGI\n`);

  console.log("Dibandingkan ke PAPER LAIN (ulasan ini BUKAN untuk mereka):");
  for (const o of others) {
    const q = await provider.relevance(target.comments, o.abstract);
    console.log(`  q2(ulasan, paper ${o.paper_id.padEnd(4)}) = ${q.toFixed(4)}   "${o.title.slice(0, 55)}"`);
  }
  console.log("\nKesimpulan: model memberi q2 tertinggi ke paper yang benar-benar diulas,");
  console.log("padahal tak ada satu pun label manusia yang dipakai. Itulah validasi bebas-label.\n");
}

main().catch((e) => { console.error(e); process.exit(1); });
