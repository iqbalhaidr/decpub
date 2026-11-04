// Thesis benchmark datasets (Bab IV) — fixed, deterministic QoS data.
// q1 = days (cost), q2 relevance & q3 actionability in [0,1], q4 = SBT balance.
//
// q2/q3 are DERIVED FROM REAL PEER REVIEWS (PeerRead, ICLR 2017) by the same
// inference-only model used in production (Xenova/all-MiniLM-L6-v2), NOT hand-set.
// See eval/realdata/ for the derivation + provenance (paper_id:review_idx per row).
// q1 (days) and q4 (SBT) are non-textual, assigned as controlled parameters per
// profile. DO NOT edit these numbers by hand; regenerate via eval/realdata/curate.ts.

export type Matrix = number[][];

export interface Preset {
  best: number;
  worst: number;
  bo: number[];
  ow: number[];
}

// D1 — worked example (n=5), reviews chosen for cross-criteria trade-offs so the
// method comparison is meaningful (Spearman TOPSIS-vs-WSM = 0.90). q2/q3 real.
// Provenance (paper_id:review_idx): 317:3, 320:10, 349:2, 322:6, 328:12
export const EVAL: Matrix = [[2,0.71,0.55,110],[3,0.82,0.33,95],[4,0.5,0.2,80],[5,0.59,0.64,70],[7,0.68,0.41,45]];
export const EVAL_L: string[] = ["R1","R2","R3","R4","R5"];
// D2 — free-riding (n=8): 6 honest/middling + 2 free-riders (low band on q2 AND q3,
// short reviews; q3 nonzero — realistic low-effort, not the extreme tail).
// Provenance: 369:17,397:5,476:10,338:5,361:10,375:4,372:4,393:10
export const FR: Matrix = [[3,0.76,0.67,100],[4,0.75,0.58,95],[3,0.71,0.7,90],[4,0.67,0.43,80],[3,0.66,0.42,75],[4,0.67,0.4,70],[2,0.5,0.13,40],[3,0.56,0.15,35]];
export const FR_L: string[] = ["Honest-A","Honest-B","Honest-C","Honest-D","Honest-E","Honest-F","Free-rider-1","Free-rider-2"];
// D3 — Sybil (n=8): 5 honest + 3 Sybil identities (low band, q4=0 for new identities).
// Provenance: 536:8,624:3,725:4,390:4,399:6,396:13,464:15,521:2
export const SYB: Matrix = [[3,0.71,0.56,95],[3,0.76,0.63,90],[4,0.8,0.6,85],[3,0.68,0.42,92],[4,0.64,0.46,80],[4,0.56,0.17,0],[4,0.46,0.1,0],[4,0.53,0.2,0]];
export const SYB_L: string[] = ["Honest-1","Honest-2","Honest-3","Honest-4","Honest-5","Sybil-a","Sybil-b","Sybil-c"];
export const CRIT: string[] = ["q1","q2","q3","q4"];
export const PRESETS: Record<string, Preset> = {
  Balanced:{best:2,worst:3,bo:[2,2,1,4],ow:[2,2,4,1]},
  "Actionability-First":{best:2,worst:0,bo:[6,2,1,3],ow:[1,3,6,2]},
  "Speed-First":{best:0,worst:3,bo:[1,2,3,6],ow:[6,3,2,1]},
  "Relevance-First":{best:1,worst:0,bo:[6,1,2,3],ow:[1,6,3,2]},
  "Reputation-First":{best:3,worst:0,bo:[6,3,2,1],ow:[1,2,3,6]}
};
