/**
 * Penyelesaian insentif satu sesi, bagian off-chain (arsitektur bagian 6.2):
 *
 *   baris QoS per pseudonim yang reveal [q1 hari, q2, q3, q4 tingkat/4]
 *     -> normalisasi min-max (q1 cost, sisanya benefit)
 *     -> Wsub (BWM, preset kebijakan jurnal) dan Wobj (ECWM, gamma) -> W = lambda*Wsub + (1-lambda)*Wobj
 *     -> matriks dan bobot dalam bilangan bulat skala 1e18, persis yang dikirim ke `IncentiveEngine`
 *     -> pratinjau (model bilangan bulat yang meniru kontrak, dan float) untuk laporan
 *
 * TOPSIS, sigmoid, dan pembagian escrow dieksekusi ON-CHAIN. Fungsi di sini murni dan deterministik,
 * sehingga hasilnya bisa diperiksa ulang dari laporan QoS yang dipublikasikan.
 */
import { normalize } from "./normalization.js";
import { computeBWM, computeECWM, fuseWeights } from "./weighting/index.js";
import { CRITERIA_TYPES, DEFAULTS, PRESETS, bwmInput, type Preset } from "./presets.js";
import { distributeFixed, distributeOnChainFloat, matrixToE18, weightsToE18, type FixedDistribution } from "./onchain.js";
import { topsis } from "./topsis.js";

/** Kebijakan bobot yang disimpan per jurnal dan dikunci per sesi (D1). */
export interface WeightPolicyInput {
  preset: string;
  lambda: number;
}

/** Kebijakan lengkap (semua yang memengaruhi hasil), dicatat di laporan dan di-hash on-chain. */
export interface IncentivePolicy {
  preset: string;
  lambda: number;
  gamma: number;
  sigmoid: { k: number; x0: number };
  /** Vektor BWM preset yang dipakai (disalin ke kebijakan supaya perubahan kode preset tidak mengubah sesi lama). */
  bwm: Preset;
  criteria: readonly ["q1", "q2", "q3", "q4"];
  criteriaTypes: readonly string[];
}

export const PRESET_NAMES = Object.keys(PRESETS) as readonly string[];

export function isPresetName(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(PRESETS, name);
}

/** Membentuk kebijakan lengkap dari kebijakan jurnal. Preset tidak dikenal = galat. */
export function resolvePolicy(p: WeightPolicyInput): IncentivePolicy {
  if (!isPresetName(p.preset)) throw new Error(`Preset BWM tidak dikenal: ${p.preset}`);
  if (!(p.lambda >= 0 && p.lambda <= 1)) throw new Error("lambda harus di [0,1]");
  return {
    preset: p.preset,
    lambda: p.lambda,
    gamma: DEFAULTS.gamma,
    sigmoid: { ...DEFAULTS.sigmoid },
    bwm: structuredClone(PRESETS[p.preset]),
    criteria: ["q1", "q2", "q3", "q4"],
    criteriaTypes: CRITERIA_TYPES,
  };
}

/** Satu baris QoS: satu pseudonim yang sudah reveal. */
export interface QosRow {
  pseudonym: string;
  /** q1: hari dari pencatatan batch sampai commit (cost). */
  q1Days: number;
  q2: number;
  q3: number;
  /** Tingkat reputasi 0..4 yang dibuktikan penelaah (q4 = tingkat / 4, sama dengan `tierToQ4` di @decpub/shared). */
  tier: number;
}

export interface Settlement {
  /** Matriks mentah [q1,q2,q3,q4] per baris. */
  raw: number[][];
  normalized: number[][];
  bwmWeights: number[];
  bwmConsistencyRatio: number;
  ecwmWeights: number[];
  fusedWeights: number[];
  /** Persis yang dikirim ke `IncentiveEngine.executeDistribution`. */
  matrixE18: bigint[][];
  weightsE18: [bigint, bigint, bigint, bigint];
  /** Model bilangan bulat yang meniru kontrak: skor TOPSIS, sigmoid, imbalan wei. */
  expected: FixedDistribution;
  /** Pratinjau floating-point dari fungsi sigmoid kontrak (D5). */
  preview: { topsisScores: number[]; sigmoidValues: number[]; shares: number[] };
}

export function computeSettlement(rows: readonly QosRow[], escrowWei: bigint, policy: IncentivePolicy): Settlement {
  if (rows.length === 0) throw new Error("Tidak ada baris QoS");
  const raw = rows.map((r) => [r.q1Days, r.q2, r.q3, Math.min(Math.max(r.tier, 0), 4) / 4]);
  const normalized = normalize(raw, [...CRITERIA_TYPES]);
  const bwm = computeBWM(bwmInput(policy.bwm));
  const ecwm = computeECWM(normalized, policy.gamma);
  const fused = fuseWeights(bwm.weights, ecwm, policy.lambda);

  const matrixE18 = matrixToE18(normalized);
  const weightsE18 = weightsToE18(fused);
  const expected = distributeFixed(matrixE18, weightsE18, escrowWei);

  const t = topsis(normalized, fused, [...CRITERIA_TYPES]);
  const prev = distributeOnChainFloat(t.scores, 1, policy.sigmoid);
  return {
    raw,
    normalized,
    bwmWeights: bwm.weights,
    bwmConsistencyRatio: bwm.consistencyRatio,
    ecwmWeights: ecwm,
    fusedWeights: fused,
    matrixE18,
    weightsE18,
    expected,
    preview: { topsisScores: t.scores, sigmoidValues: prev.sigmoidValues, shares: prev.shares },
  };
}
