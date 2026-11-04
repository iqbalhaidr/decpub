/**
 * Deterministic abstract extraction (Fase 1a — paper ingestion).
 *
 * When an author submits a paper, the system needs the paper text to compute
 * q2 (relevance of a review to the paper). This extracts the Abstract section
 * as a concise, bounded representation of the paper's topic.
 *
 * Strategy (deterministic, transparent — no model needed):
 *   1. Locate an "Abstract" heading; take text until the next section
 *      (Keywords / Index Terms / Introduction / numbered heading).
 *   2. Fallback: the first substantial paragraph.
 *   3. Last resort: a leading slice of the whole text.
 *
 * Whitespace is collapsed and the result is capped to keep embeddings bounded.
 */

const MAX_CHARS = 3000;

export function extractAbstract(fullText: string): string {
  if (!fullText) return "";
  const text = fullText.replace(/\r\n/g, "\n");

  // 1) Explicit "Abstract" heading.
  const headingMatch = text.match(/\babstract\b\s*[:.\-—]?\s*\n?/i);
  if (headingMatch && headingMatch.index !== undefined) {
    const start = headingMatch.index + headingMatch[0].length;
    const rest = text.slice(start);
    const endMatch = rest.match(
      /\n\s*(keywords?|key\s*words|index\s*terms|categories\s+and\s+subject|1\.?\s+introduction|i\.\s+introduction|introduction)\b/i
    );
    const abstract = (
      endMatch && endMatch.index !== undefined ? rest.slice(0, endMatch.index) : rest
    ).trim();
    if (collapseWhitespace(abstract).length >= 40) {
      return collapseWhitespace(abstract).slice(0, MAX_CHARS);
    }
  }

  // 2) First substantial paragraph.
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => collapseWhitespace(p))
    .filter((p) => p.length > 40);
  if (paragraphs.length > 0) return paragraphs[0].slice(0, MAX_CHARS);

  // 3) Leading slice.
  return collapseWhitespace(text).slice(0, MAX_CHARS);
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Deterministically extract a plausible paper title: the first substantial line
 * in the text preceding the Abstract, skipping obvious non-title lines
 * (emails, affiliations, dates, the word "abstract").
 */
export function extractTitle(fullText: string): string {
  if (!fullText) return "";
  const text = fullText.replace(/\r\n/g, "\n");
  const absIdx = text.search(/\babstract\b/i);
  const head = absIdx > 0 ? text.slice(0, absIdx) : text.slice(0, 800);
  const lines = head
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const l of lines) {
    if (
      l.length >= 6 &&
      l.length <= 250 &&
      !/@|^\d|\b(university|department|institute|faculty|abstract|doi|arxiv|copyright)\b/i.test(l)
    ) {
      return collapseWhitespace(l).slice(0, 200);
    }
  }
  return lines.length > 0 ? collapseWhitespace(lines[0]).slice(0, 200) : "";
}
