/**
 * metric-gaming.ts — F5 (PDF Sec 6.5 / NFR-Q05): metric-gaming resistance + mitigation.
 *
 * Red-team test of whether the multi-criteria pipeline resists an adversary who
 * attacks the AI MEASUREMENT INSTRUMENT (q2/q3) rather than doing real work.
 * Does NOT modify the pipeline; exercises the real engine (../../middleware via
 * eval/core) and the real inference-only scorer (LocalModelProvider).
 *
 * Attacks (built from a real baseline review + its paper abstract):
 *   copy-abstract        -> attacks q2 (relevance): review text = paper abstract.
 *   template-suggestions -> attacks q3 (actionability): generic "fix X" templates.
 *   combined             -> attacks q2 AND q3: abstract + templates.
 *
 * Mitigation sweep: the same attacks are evaluated under editorial presets that
 * weight the UN-GAMEABLE reputation criterion (q4) increasingly, showing that
 * gaming payoff shrinks as trust shifts from the gameable AI proxies (q2/q3) to
 * the earned, non-transferable reputation (q4).
 *
 * Efficiency: q2/q3 scoring (the expensive AI part) is preset-independent, so it
 * runs ONCE per review/attack and is cached; only the cheap pipeline aggregation
 * re-runs per preset.
 *
 * Determinism: fixed SHA1 sample order + fixed honest cohort + fixed templates.
 * Raw review text is read from a scratchpad file (NOT committed); only aggregate
 * numbers are emitted.
 *
 * Run: npx ts-node eval/realdata/metric-gaming.ts <peerread_full.json> [sampleN] [out.json]
 */
import * as fs from "fs";
import * as crypto from "crypto";
import { createProvider } from "../../middleware/qos";
import { runPipeline } from "../core";

type Rec = { paper_id: string; review_idx: number; abstract: string; comments: string };

// Editorial presets (all CR=0) spanning LOW to HIGH weight on the un-gameable
// reputation criterion q4. Balanced is the production default.
const PRESETS: { label: string; q4w: number; bwm: any }[] = [
  { label: "Balanced (q4=0.11)", q4w: 0.111, bwm: { bestIndex: 2, worstIndex: 3, bestToOthers: [2, 2, 1, 4], othersToWorst: [2, 2, 4, 1] } },
  { label: "Rep-aware (q4=0.40)", q4w: 0.400, bwm: { bestIndex: 3, worstIndex: 0, bestToOthers: [2, 2, 2, 1], othersToWorst: [1, 1, 1, 2] } },
  { label: "Reputation-First (q4=0.53)", q4w: 0.533, bwm: { bestIndex: 3, worstIndex: 0, bestToOthers: [8, 4, 2, 1], othersToWorst: [1, 2, 4, 8] } },
];

// Representative HONEST batch (fixed). Adversary appended as the last row.
const HONEST_COHORT: number[][] = [
  [3, 0.72, 0.60, 95],
  [4, 0.68, 0.52, 88],
  [3, 0.75, 0.65, 100],
  [5, 0.64, 0.45, 80],
  [4, 0.70, 0.55, 90],
];
// Adversary non-textual criteria (fixed, identical honest-vs-attack so ONLY q2/q3
// vary). q1=4 is NEUTRAL (cohort median, no unearned timeliness edge); q4=40 is low
// reputation, as a gaming reviewer has not earned standing.
const ADV_Q1 = 4;
const ADV_Q4 = 40;
const POOL = 2.0;

const TEMPLATES = [
  "Please revise this section for clarity.",
  "Consider adding more experiments to strengthen the results.",
  "The equation should be corrected and normalized.",
  "Add labels to the figures and tables.",
  "The related work should cite more recent studies.",
  "Improve the writing and fix the typos.",
  "Provide more details about the experimental setup.",
  "Clarify the notation used in the method section.",
];

const ATTACKS: { key: string; label: string; build: (r: Rec) => string }[] = [
  { key: "copy_abstract", label: "Salin abstrak (q2)", build: (r) => r.abstract },
  { key: "template_suggest", label: "Template saran (q3)", build: () => TEMPLATES.join(" ") },
  { key: "combined", label: "Gabungan (q2+q3)", build: (r) => `${r.abstract} ${TEMPLATES.join(" ")}` },
];

function mean(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length; }

async function main() {
  const [, , inPath, sampleArg, outArg] = process.argv;
  if (!inPath) { console.error("usage: ts-node metric-gaming.ts <peerread_full.json> [sampleN] [out.json]"); process.exit(1); }
  const sampleN = sampleArg ? parseInt(sampleArg, 10) : 40;

  const all: Rec[] = JSON.parse(fs.readFileSync(inPath, "utf8"));
  const keyed = all
    .map((r) => ({ r, h: crypto.createHash("sha1").update(`${r.paper_id}:${r.review_idx}`).digest("hex") }))
    .sort((a, b) => (a.h < b.h ? -1 : 1))
    .map((x) => x.r)
    .filter((r) => (r.abstract || "").length > 50 && (r.comments || "").length > 100);
  const sample = keyed.slice(0, Math.min(sampleN, keyed.length));
  console.log(`loaded ${all.length}; red-teaming on fixed sample of ${sample.length}`);

  const provider = await createProvider("local");
  console.log(`provider: ${provider.name}\n`);

  // ---- Phase 1: score q2/q3 ONCE (preset-independent), cache. ----
  type Scored = { q2Base: number; q3Base: number; atk: Record<string, { q2: number; q3: number }> };
  const scored: Scored[] = [];
  const t0 = Date.now();
  for (let i = 0; i < sample.length; i++) {
    const r = sample[i];
    const q2Base = await provider.relevance(r.comments, r.abstract);
    const q3Base = await provider.actionability(r.comments);
    const atk: Record<string, { q2: number; q3: number }> = {};
    for (const a of ATTACKS) {
      const text = a.build(r);
      atk[a.key] = { q2: await provider.relevance(text, r.abstract), q3: await provider.actionability(text) };
    }
    scored.push({ q2Base, q3Base, atk });
    if ((i + 1) % 5 === 0 || i === sample.length - 1) {
      console.log(`  scored ${i + 1}/${sample.length}  (${((i + 1) / ((Date.now() - t0) / 1000)).toFixed(2)}/s)`);
    }
  }

  // ---- Phase 2: sweep presets over cached scores (cheap pipeline only). ----
  const advIdx = HONEST_COHORT.length;
  const sweep = PRESETS.map((p) => {
    const perAttack = ATTACKS.map((a) => {
      const dQ2: number[] = [], dQ3: number[] = [], rewardGain: number[] = [], rewardGainPct: number[] = [];
      let overtake = 0, rank1 = 0;
      for (const sc of scored) {
        const honest = runPipeline([...HONEST_COHORT, [ADV_Q1, sc.q2Base, sc.q3Base, ADV_Q4]], { bwm: p.bwm });
        const rHonest = honest.rewards[advIdx];
        const g = sc.atk[a.key];
        const atk = runPipeline([...HONEST_COHORT, [ADV_Q1, g.q2, g.q3, ADV_Q4]], { bwm: p.bwm });
        const rAtk = atk.rewards[advIdx];
        const honestRewards = atk.rewards.filter((_, k) => k !== advIdx);
        dQ2.push(g.q2 - sc.q2Base); dQ3.push(g.q3 - sc.q3Base);
        rewardGain.push(rAtk - rHonest);
        rewardGainPct.push(rHonest > 0 ? (rAtk - rHonest) / rHonest * 100 : 0);
        if (rAtk > Math.min(...honestRewards)) overtake++;
        if (rAtk >= Math.max(...honestRewards)) rank1++;
      }
      const n = scored.length;
      return { attack: a.label, dQ2: mean(dQ2), dQ3: mean(dQ3), rewardGain: mean(rewardGain), rewardGainPct: mean(rewardGainPct), rewardVsPoolPct: mean(rewardGain) / POOL * 100, overtakeFrac: overtake / n, rank1Frac: rank1 / n };
    });
    return { preset: p.label, q4w: p.q4w, perAttack };
  });

  // ---- Report ----
  for (const p of sweep) {
    console.log(`\n=== Preset: ${p.preset} ===`);
    console.log("Serangan             dQ2     dQ3     RewardGain  (%pool)  Overtake  Rank1");
    for (const a of p.perAttack) {
      console.log(`${a.attack.padEnd(20)} ${sg(a.dQ2)}  ${sg(a.dQ3)}  ${sg(a.rewardGain)}    ${a.rewardVsPoolPct >= 0 ? "+" : ""}${a.rewardVsPoolPct.toFixed(1)}%   ${(a.overtakeFrac * 100).toFixed(0)}%      ${(a.rank1Frac * 100).toFixed(0)}%`);
    }
  }
  console.log(`\n=== Ringkas: serangan GABUNGAN vs bobot reputasi (q4) ===`);
  console.log("Preset                       q4w    RewardGain(%pool)  Overtake  Rank1");
  for (const p of sweep) {
    const c = p.perAttack.find((x) => x.attack.startsWith("Gabungan"))!;
    console.log(`${p.preset.padEnd(28)} ${p.q4w.toFixed(2)}   ${c.rewardVsPoolPct >= 0 ? "+" : ""}${c.rewardVsPoolPct.toFixed(1)}%             ${(c.overtakeFrac * 100).toFixed(0)}%      ${(c.rank1Frac * 100).toFixed(0)}%`);
  }
  console.log("");

  const outPath = outArg || "metric-gaming-result.json";
  fs.writeFileSync(outPath, JSON.stringify({ sampleN: sample.length, honestCohort: HONEST_COHORT.length, pool: POOL, sweep }, null, 2));
  console.log(`saved -> ${outPath}`);
}

function sg(x: number): string { return (x >= 0 ? "+" : "") + x.toFixed(3); }

main().catch((e) => { console.error(e); process.exit(1); });
