/**
 * QoS Pre-Processing (Fase 1 — input acquisition)
 *
 * Turns raw reviewer submissions (review text + timestamps + on-chain SBT) into
 * the QoS decision matrix consumed by the MCDM pipeline. q2 and q3 are derived
 * by a pluggable AI provider (see types.ts); q1 and q4 are non-textual.
 *
 * Matrix columns: [q1 timeliness (cost), q2 relevance (benefit),
 *                  q3 actionability (benefit), q4 reputation (benefit)].
 */

import { QoSProvider, ReviewerSubmission, QoSRow } from "./types";
import { HeuristicProvider } from "./heuristic";

export * from "./types";
export { HeuristicProvider } from "./heuristic";
export { LocalModelProvider } from "./localModel";
export { extractAbstract, extractTitle } from "./abstract";

/**
 * Create a QoS provider.
 *
 *   "auto" (default): use the real local AI model if the optional dependency
 *                     (@huggingface/transformers) is installed and loads;
 *                     otherwise fall back to the deterministic heuristic provider.
 *   "local"         : require the real model (throws if unavailable).
 *   "heuristic"     : force the deterministic fallback.
 *
 * Selection can also be set via the QOS_PROVIDER environment variable.
 */
export async function createProvider(pref?: string): Promise<QoSProvider> {
  const choice = (pref ?? process.env.QOS_PROVIDER ?? "auto").toLowerCase();

  if (choice === "heuristic") return new HeuristicProvider();

  try {
    const { LocalModelProvider } = await import("./localModel");
    const provider = new LocalModelProvider();
    await provider.init();
    return provider;
  } catch (e) {
    const msg = (e as Error).message.split("\n")[0];
    if (choice === "local") {
      throw new Error(`Local AI model requested but unavailable: ${msg}`);
    }
    console.warn(
      `[qos] Local AI model unavailable (${msg}); falling back to deterministic heuristic provider.`
    );
    return new HeuristicProvider();
  }
}

/**
 * Build the QoS decision matrix from raw reviewer submissions and paper text.
 * q2/q3 are computed by the provider; q1/q4 are taken directly from the submission.
 */
export async function buildQoSMatrix(
  submissions: ReviewerSubmission[],
  paperText: string,
  provider: QoSProvider
): Promise<{ matrix: number[][]; rows: QoSRow[] }> {
  const rows: QoSRow[] = [];
  for (const s of submissions) {
    const q2 = await provider.relevance(s.reviewText, paperText);
    const q3 = await provider.actionability(s.reviewText);
    rows.push({ reviewer: s.reviewer, q1: s.daysToSubmit, q2, q3, q4: s.sbtBalance });
  }
  const matrix = rows.map((r) => [r.q1, r.q2, r.q3, r.q4]);
  return { matrix, rows };
}
