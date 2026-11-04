/**
 * Pembuat PDF contoh untuk demo dan tes. Setiap jenis memicu satu jalur pengecekan P03:
 *
 *  - clean            : lengkap, isi TANPA identitas -> Pass, tanpa peringatan.
 *  - identity-exposed : lengkap, tetapi isi memuat nama, afiliasi, dan surel -> Pass dengan
 *                       peringatan `identityExposed` (batasan B1: anonimisasi tidak menyentuh isi).
 *  - incomplete       : tanpa kata kunci dan subjek di metadata -> Incomplete.
 *  - plagiarized      : isi disalin dari korpus -> Reject (skor di atas ambang).
 *  - too-long         : 100 halaman -> Reject (batas halaman Ciko: kurang dari 100).
 *
 * Metadata `Author` PDF sengaja diisi pada semua jenis agar terlihat bahwa anonimisasi
 * (P04) menghapusnya.
 */
import { PDFDocument, StandardFonts } from "pdf-lib";

export const SAMPLE_KINDS = ["clean", "identity-exposed", "incomplete", "plagiarized", "too-long"] as const;
export type SampleKind = (typeof SAMPLE_KINDS)[number];
export const isSampleKind = (v: string): v is SampleKind => (SAMPLE_KINDS as readonly string[]).includes(v);

export interface SampleOptions {
  kind: SampleKind;
  title?: string;
  /** Biji pembuat teks isi; seed berbeda menghasilkan isi berbeda (mencegah tabrakan korpus). */
  seed?: string;
  authorName?: string;
  authorEmail?: string;
  affiliation?: string;
  /** Teks yang disalin untuk jenis `plagiarized` (diambil dari korpus). */
  plagiarizedText?: string;
}

export const SAMPLE_DEFAULTS = {
  title: "A Study of Verifiable Review Workflows",
  authorName: "Dr. Jane Doe",
  authorEmail: "jane.doe@example.edu",
  affiliation: "Institute of Distributed Systems",
};

// ---- pembuat teks deterministik ----

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}

const SUBJECTS = ["the proposed protocol", "our measurement study", "the reference implementation", "the evaluated scheme", "this experiment", "the baseline method", "the sampled workload", "the pilot deployment"];
const VERBS = ["reduces", "increases", "stabilises", "exposes", "bounds", "approximates", "validates", "complicates", "improves", "limits"];
const OBJECTS = ["latency under bursty load", "memory pressure on small nodes", "agreement between independent raters", "the cost of repeated verification", "variance across repeated trials", "coverage of rarely used features", "the effect of network partitions", "sensitivity to the choice of threshold", "throughput at moderate concurrency", "reproducibility of intermediate results"];
const TAILS = ["in most configurations", "when the sample is small", "after warm up", "with high confidence", "under realistic assumptions", "although the margin is modest", "as the dataset grows", "across three independent runs"];

function generateBody(seed: string, paragraphs = 5): string[] {
  const rnd = mulberry32(hashSeed(seed));
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  const out: string[] = [];
  for (let p = 0; p < paragraphs; p++) {
    const sentences: string[] = [];
    for (let s = 0; s < 6; s++) {
      sentences.push(`${pick(SUBJECTS)} ${pick(VERBS)} ${pick(OBJECTS)} ${pick(TAILS)}, as observed in trial ${Math.floor(rnd() * 900) + 100}`);
    }
    const text = sentences.join(". ") + ".";
    out.push(text.charAt(0).toUpperCase() + text.slice(1));
  }
  return out;
}

function wrap(text: string, max = 88): string[] {
  const lines: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    if ((line + " " + w).trim().length > max) {
      lines.push(line);
      line = w;
    } else {
      line = (line + " " + w).trim();
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function generateSamplePdf(options: SampleOptions): Promise<Buffer> {
  // Nilai undefined dibuang supaya tidak menimpa bawaan.
  const given = Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)) as unknown as SampleOptions;
  const o = { ...SAMPLE_DEFAULTS, seed: given.title ?? given.kind, ...given };
  const doc = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const abstract = `This sample manuscript was generated for testing the review workflow. ${generateBody(o.seed + ":abstract", 1)[0]}`;
  const keywords = ["review", "anonymity", "workflow"];

  doc.setTitle(o.title);
  doc.setAuthor(o.authorName); // sengaja: P04 harus menghapusnya
  doc.setCreator(o.authorName);
  doc.setProducer("Sample Generator");
  if (o.kind !== "incomplete") {
    doc.setSubject("Scientific manuscript");
    doc.setKeywords(keywords);
  }

  if (o.kind === "too-long") {
    for (let i = 0; i < 100; i++) doc.addPage([595.28, 841.89]).drawText(`Page ${i + 1}`, { x: 50, y: 750, size: 12, font });
    return Buffer.from(await doc.save());
  }

  let page = doc.addPage([595.28, 841.89]);
  let y = 780;
  const line = (text: string, size = 11, f = font) => {
    if (y < 60) {
      page = doc.addPage([595.28, 841.89]);
      y = 780;
    }
    page.drawText(text, { x: 50, y, size, font: f });
    y -= size + 6;
  };

  line(o.title, 18, bold);
  y -= 8;
  if (o.kind === "identity-exposed") {
    line(o.authorName, 12);
    line(o.affiliation, 11);
    line(o.authorEmail, 11);
    y -= 8;
  }
  line("Abstract", 14, bold);
  for (const l of wrap(abstract)) line(l);
  y -= 6;
  line(`Keywords: ${keywords.join(", ")}`, 11);
  y -= 10;
  line("1. Introduction", 14, bold);

  const body = o.kind === "plagiarized" && o.plagiarizedText ? [o.plagiarizedText] : generateBody(o.seed);
  for (const para of body) {
    for (const l of wrap(para)) line(l);
    y -= 8;
  }

  return Buffer.from(await doc.save());
}
