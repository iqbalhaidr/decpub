/**
 * QoS Pre-Processing Types (Fase 1 — input acquisition)
 *
 * Thesis ref: Bab I Batasan Masalah + III.2.2 (Operasionalisasi q2/q3).
 *
 * q2 (relevansi/kedalaman) and q3 (actionability) are derived from raw review
 * text using a PRE-TRAINED language model, INFERENCE-ONLY (no fine-tuning).
 * The model is treated as a measurement instrument; model selection/optimization
 * is out of research scope. q1 (timeliness) and q4 (reputation) are non-textual
 * (OJS timestamps / on-chain SBT) and do NOT pass through the model.
 */

export interface ReviewerSubmission {
  /** Reviewer identifier. */
  reviewer: string;
  /** Full review text — input to the AI model for q2 (relevance) and q3 (actionability). */
  reviewText: string;
  /** Days taken to submit the review → q1 (COST: lower is better). */
  daysToSubmit: number;
  /** On-chain SBT reputation balance after decay → q4 (BENEFIT). */
  sbtBalance: number;
}

/** A pluggable AI model used to derive q2 and q3 from text. */
export interface QoSProvider {
  /** Human-readable provider name (shown in logs / reports for auditability). */
  readonly name: string;
  /** q2 — semantic relevance of a review to the paper, in [0,1]. */
  relevance(reviewText: string, paperText: string): Promise<number>;
  /** q3 — actionability: proportion of concrete, actionable sentences, in [0,1]. */
  actionability(reviewText: string): Promise<number>;
}

/** One reviewer's full QoS vector after pre-processing. */
export interface QoSRow {
  reviewer: string;
  q1: number;
  q2: number;
  q3: number;
  q4: number;
}
