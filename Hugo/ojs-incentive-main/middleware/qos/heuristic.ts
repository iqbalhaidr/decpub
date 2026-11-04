/**
 * Deterministic, offline, zero-dependency QoS provider.
 *
 * Serves as a reproducible STAND-IN / fallback for the real language model
 * (see localModel.ts). Being fully deterministic, it lets the pipeline, tests,
 * and evaluation run without network or model downloads (satisfies NFR-02).
 *
 *   q2 (relevance)     ≈ cosine of bag-of-words term-frequency vectors
 *                        (a transparent lexical proxy for embedding similarity)
 *   q3 (actionability) = proportion of sentences containing concrete-suggestion
 *                        markers and/or specific location references
 *
 * NOTE: this is NOT the AI model itself — it approximates it deterministically.
 * The real instrument is LocalModelProvider; this only guarantees the pipeline
 * always runs and that outputs are reproducible.
 */

import { QoSProvider } from "./types";

const STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "of", "to", "and", "in", "on", "for", "this",
  "that", "it", "be", "as", "with", "by", "or", "at", "from", "but", "not",
]);

const ACTION_MARKERS =
  /\b(should|consider|recommend|suggest|add|revise|clarify|provide|include|fix|improve|missing|increase|reduce|replace|specify|define|expand|remove|rephrase|justify|address|correct)\b/i;

const REFERENCE_MARKERS =
  /\b(section|sec|figure|fig|table|tab|equation|eq|line|page|paragraph)s?\.?\s*\d/i;

export class HeuristicProvider implements QoSProvider {
  readonly name = "heuristic (deterministic stand-in)";

  async relevance(reviewText: string, paperText: string): Promise<number> {
    return cosineTF(termFreq(reviewText), termFreq(paperText));
  }

  async actionability(reviewText: string): Promise<number> {
    const sentences = splitSentences(reviewText);
    if (sentences.length === 0) return 0;
    const actionable = sentences.filter(isActionable).length;
    return actionable / sentences.length;
  }
}

function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z]+/g);
  if (!matches) return [];
  return matches.filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function termFreq(text: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of tokenize(text)) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function cosineTF(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const v of a.values()) na += v * v;
  for (const v of b.values()) nb += v * v;
  for (const [k, v] of a) {
    const w = b.get(k);
    if (w) dot += v * w;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isActionable(sentence: string): boolean {
  return ACTION_MARKERS.test(sentence) || REFERENCE_MARKERS.test(sentence);
}
