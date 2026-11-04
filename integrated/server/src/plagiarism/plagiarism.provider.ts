/**
 * Pengecekan plagiarisme [SIMULASI]: tumpang tindih n-gram kata terhadap korpus lokal.
 * Pengganti mock Roihan (`oracle/src/plagiarism.js`, yang memberi skor 93 untuk semua naskah
 * bila Pinata tidak dikonfigurasi, sehingga SEMUA naskah ditolak; arsitektur bagian 14 butir 5).
 *
 * Skor deterministik 0-100: persentase 5-gram kata naskah yang juga ada di korpus.
 * Mengganti dengan layanan nyata: implementasikan `PlagiarismProvider`.
 */
import { Inject, Injectable } from "@nestjs/common";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_CONFIG, type AppConfig } from "../config/config.js";

export interface PlagiarismProvider {
  readonly name: string;
  /** 0-100. */
  score(text: string): Promise<number>;
}

export const PLAGIARISM_PROVIDER = Symbol("PLAGIARISM_PROVIDER");

const words = (text: string): string[] => text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

export function shingles(text: string, n: number): Set<string> {
  const w = words(text);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

export class NgramPlagiarismProvider implements PlagiarismProvider {
  readonly name = "[SIMULASI] ngram-overlap";
  private readonly corpus: Set<string>;

  constructor(
    documents: string[],
    private readonly n = 5,
  ) {
    this.corpus = new Set(documents.flatMap((d) => [...shingles(d, n)]));
  }

  async score(text: string): Promise<number> {
    const s = shingles(text, this.n);
    if (s.size === 0) return 0;
    let hit = 0;
    for (const g of s) if (this.corpus.has(g)) hit++;
    return Math.round((100 * hit) / s.size);
  }
}

/** Memuat `*.txt` dari direktori korpus. */
export function loadCorpus(dir: string): { name: string; text: string }[] {
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".txt"))
      .sort()
      .map((f) => ({ name: f, text: readFileSync(join(dir, f), "utf8") }));
  } catch {
    return [];
  }
}

@Injectable()
export class CorpusService {
  readonly documents: { name: string; text: string }[];
  constructor(@Inject(APP_CONFIG) config: Pick<AppConfig, "corpusDir">) {
    this.documents = loadCorpus(config.corpusDir);
  }
}

export const plagiarismProviderFactory = {
  provide: PLAGIARISM_PROVIDER,
  inject: [CorpusService],
  useFactory: (corpus: CorpusService): PlagiarismProvider => new NgramPlagiarismProvider(corpus.documents.map((d) => d.text)),
};
