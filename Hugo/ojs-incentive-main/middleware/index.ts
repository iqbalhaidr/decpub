/**
 * Middleware — OJS Incentive Mechanism
 *
 * Orchestrates the full pipeline:
 *   Raw QoS data → Normalization → Weighting (BWM + ECWM + Fusion) → TOPSIS
 *
 * The middleware output (scores, weights, normalized data) is then
 * sent to the blockchain layer for on-chain TOPSIS verification
 * and token distribution.
 */

export { normalize, type CriterionType } from "./normalization";
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
} from "./weighting";
export { topsis, type TOPSISResult } from "./topsis";
export { sigmoid, distribute, type SigmoidParams, type DistributionResult } from "./sigmoid";
export {
  createProvider,
  buildQoSMatrix,
  extractAbstract,
  extractTitle,
  HeuristicProvider,
  LocalModelProvider,
  type QoSProvider,
  type ReviewerSubmission,
  type QoSRow,
} from "./qos";
