/**
 * Preset BWM (Best-Worst Method) Hugo, dari `frontend/config/eval-datasets.ts:35-39`
 * (vektor yang dipakai angka evaluasi di laporan, bukan vektor `server/index.ts:77-81`).
 * Indeks kriteria: 0=q1, 1=q2, 2=q3, 3=q4. `bo` = best-to-others, `ow` = others-to-worst.
 * Preset per jurnal dan penguncian saat sesi dibuat dikerjakan di M7.
 */
import type { BWMInput } from "./weighting/index.js";
import type { CriterionType } from "./normalization.js";

export interface Preset {
  best: number;
  worst: number;
  bo: number[];
  ow: number[];
}

export const PRESETS: Record<string, Preset> = {
  Balanced: { best: 2, worst: 3, bo: [2, 2, 1, 4], ow: [2, 2, 4, 1] },
  "Actionability-First": { best: 2, worst: 0, bo: [6, 2, 1, 3], ow: [1, 3, 6, 2] },
  "Speed-First": { best: 0, worst: 3, bo: [1, 2, 3, 6], ow: [6, 3, 2, 1] },
  "Relevance-First": { best: 1, worst: 0, bo: [6, 1, 2, 3], ow: [1, 6, 3, 2] },
  "Reputation-First": { best: 3, worst: 0, bo: [6, 3, 2, 1], ow: [1, 2, 3, 6] },
};

export function bwmInput(p: Preset): BWMInput {
  return { bestIndex: p.best, worstIndex: p.worst, bestToOthers: p.bo, othersToWorst: p.ow };
}

/** q1 = waktu (cost); q2, q3, q4 = benefit. Sama dengan `CRITERIA_TYPES` Hugo. */
export const CRITERIA_TYPES: CriterionType[] = ["cost", "benefit", "benefit", "benefit"];

/** Bawaan Hugo: lambda 0,6 (fusi BWM dan ECWM), gamma 0,5 (Entropy dan CRITIC), k 10, x0 0,5. */
export const DEFAULTS = { lambda: 0.6, gamma: 0.5, sigmoid: { k: 10, x0: 0.5 } } as const;
