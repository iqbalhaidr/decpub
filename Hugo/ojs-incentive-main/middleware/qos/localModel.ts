/**
 * Real AI provider — pre-trained sentence-embedding model running LOCALLY
 * (offline) via transformers.js. INFERENCE-ONLY, no fine-tuning.
 *
 * Thesis ref: Bab I Batasan Masalah ("model siap-pakai, inference-only,
 * pemilihan/optimasi di luar lingkup") + III.2.2.
 *
 * Properties relevant to the thesis:
 *   - Deterministic given a fixed model version  → NFR-02 (determinism), audit.
 *   - No API key / no network after first download → self-contained, reproducible.
 *
 *   q2 (relevance)     = cosine(embed(review), embed(paper)), clamped to [0,1]
 *   q3 (actionability) = proportion of review sentences whose embedding is
 *                        closer to an "actionable" exemplar centroid than to a
 *                        "non-actionable" one
 *
 * Requires the optional dependency:
 *     npm install @huggingface/transformers
 * Model: Xenova/all-MiniLM-L6-v2 (downloaded once, ~23 MB quantized).
 */

import { QoSProvider } from "./types";

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

// Exemplars defining the two poles for sentence-level actionability (q3).
const ACTIONABLE_EXEMPLARS = [
  "In Section 3.2 the sample size is too small; consider increasing it.",
  "Equation 4 is missing a normalization term and should be corrected.",
  "Please add labels to the axes of Figure 2.",
  "The related-work section should cite more recent studies.",
];
const NONACTION_EXEMPLARS = [
  "This paper is good and well written.",
  "I enjoyed reading this manuscript.",
  "The work is interesting and relevant.",
  "Overall the contribution is acceptable for publication.",
];

export class LocalModelProvider implements QoSProvider {
  readonly name = `local model (${MODEL_ID}, inference-only)`;
  private extractor: ((text: string, opts: object) => Promise<{ data: Float32Array }>) | null = null;
  private actionCentroid: number[] = [];
  private nonActionCentroid: number[] = [];

  /** Lazily import the optional dependency and load the model + exemplar centroids. */
  async init(): Promise<void> {
    // Dynamic import via an indirect specifier so TypeScript does not statically
    // resolve this optional dependency. A missing dep throws here at runtime and
    // is handled gracefully by the provider factory (createProvider).
    const moduleId = "@huggingface/transformers";
    const transformers: { pipeline: (task: string, model: string) => Promise<unknown> } =
      await import(moduleId);
    this.extractor = (await transformers.pipeline("feature-extraction", MODEL_ID)) as never;
    this.actionCentroid = await this.centroid(ACTIONABLE_EXEMPLARS);
    this.nonActionCentroid = await this.centroid(NONACTION_EXEMPLARS);
  }

  private async embed(text: string): Promise<number[]> {
    if (!this.extractor) throw new Error("LocalModelProvider not initialized — call init() first");
    const out = await this.extractor(text, { pooling: "mean", normalize: true });
    return Array.from(out.data);
  }

  private async centroid(texts: string[]): Promise<number[]> {
    const vecs = await Promise.all(texts.map((t) => this.embed(t)));
    const dim = vecs[0].length;
    const c = new Array(dim).fill(0);
    for (const v of vecs) for (let i = 0; i < dim; i++) c[i] += v[i];
    for (let i = 0; i < dim; i++) c[i] /= vecs.length;
    return c;
  }

  async relevance(reviewText: string, paperText: string): Promise<number> {
    const [r, p] = await Promise.all([this.embed(reviewText), this.embed(paperText)]);
    return clamp01(cosine(r, p));
  }

  async actionability(reviewText: string): Promise<number> {
    const sentences = reviewText
      .split(/[.!?]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (sentences.length === 0) return 0;
    let actionable = 0;
    for (const s of sentences) {
      const e = await this.embed(s);
      if (cosine(e, this.actionCentroid) >= cosine(e, this.nonActionCentroid)) actionable++;
    }
    return actionable / sentences.length;
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
