/**
 * @decpub/incentive-core: mesin insentif Hugo.
 *
 * Disalin dari `Hugo/ojs-incentive-main/middleware` tanpa mengubah rumus (hanya ekstensi
 * impor `.js`): `normalization`, `weighting/{bwm,ecwm,fusion}`, `topsis`, `sigmoid`.
 * Ditambah di integrasi: `onchain.ts` (konversi ke format kontrak, model referensi bilangan bulat
 * yang meniru `IncentiveEngine` persis), `datasets.ts` dan `presets.ts` (data D1-D3 dan preset BWM Hugo).
 * `qos.ts` (QoSProvider, SimulatedQoSProvider) dan `settlement.ts` (matriks QoS -> masukan kontrak + laporan) di M7.
 */
export { normalize, type CriterionType } from "./normalization.js";
export {
  computeBWM,
  computeECWM,
  computeECWMDetail,
  computeEntropyWeights,
  computeEntropyDetail,
  computeCRITICWeights,
  computeCRITICDetail,
  fuseWeights,
  type BWMInput,
  type BWMResult,
  type EntropyDetail,
  type CRITICDetail,
  type ECWMDetail,
} from "./weighting/index.js";
export { topsis, type TOPSISResult } from "./topsis.js";
export { sigmoid, distribute, type SigmoidParams, type DistributionResult } from "./sigmoid.js";
export * from "./onchain.js";
export * from "./datasets.js";
export * from "./presets.js";
export * from "./pipeline.js";
export * from "./qos.js";
export * from "./settlement.js";
