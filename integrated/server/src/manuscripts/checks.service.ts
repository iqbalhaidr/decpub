/**
 * P03 - Pengecekan otomatis kelengkapan (F05-F06).
 *
 * Aturan `result` mengikuti Ciko (`manuscripts-automatic-check.service.ts`), dengan tiga
 * perbedaan yang disengaja:
 *  1. `result` dihitung SERVER dari berkas, bukan diterima dari klien (di Ciko DTO
 *     `RecordAutomaticCheckDto.result` dikirim klien, `flows.dto.ts:99-101`, sehingga siapa
 *     pun bisa meloloskan naskah).
 *  2. Ditambah plagiarisme: skor di atas ambang -> Reject.
 *  3. `identityExposed` berarti "nama/surel/afiliasi penulis masih terbaca di isi naskah
 *     ANONIM", bukan "metadata Author ada" (itu selalu true pada berkas asli dan akan
 *     dihapus P04). Hanya peringatan: tidak mengubah `result` (keputusan B1).
 *
 * Fungsi `evaluate` murni (tanpa chain/storage) sehingga mudah dites.
 */
import { Inject, Injectable } from "@nestjs/common";
import { keccak256, toBytes, type Hex } from "viem";
import { AutomaticCheckResult, type AutomaticCheckResultValue } from "@decpub/shared";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { extractPdfText, normalizeText } from "../pdf/pdf-text.js";
import { readPdfInfo } from "../pdf/pdf-info.js";
import { PLAGIARISM_PROVIDER, type PlagiarismProvider } from "../plagiarism/plagiarism.provider.js";
import { PRIVATE_STORE, type PrivateStore } from "../storage/private-store.js";
import { getJson, refs, type IdentityRecord } from "./manuscript-files.js";

const MAX_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_PAGES_EXCLUSIVE = 100;
const MIN_IDENTITY_LEN = 4;

export interface CheckFlags {
  formatValid: boolean;
  sizeValid: boolean;
  pageCountValid: boolean;
  metadataPresent: boolean;
  abstractPresent: boolean;
  /** Peringatan: identitas penulis terbaca di isi naskah anonim. */
  identityExposed: boolean;
  plagiarismBelowThreshold: boolean;
}

export interface CheckReport {
  schema: "decpub.automatic-check.v1";
  sessionId: Hex;
  checkedAt: string;
  fileSize: number;
  pageCount: number;
  flags: CheckFlags;
  /** Jenis data yang terbaca (authorName/authorEmail/affiliation), TANPA nilainya: laporan ini publik. */
  identityExposedFields: string[];
  plagiarism: { provider: string; score: number; threshold: number };
  result: "Pass" | "Incomplete" | "Reject";
  notes: string;
}

export interface CheckOutcome {
  report: CheckReport;
  reportBytes: Uint8Array;
  reportHash: Hex;
  flagsHash: Hex;
  resultValue: AutomaticCheckResultValue;
}

export interface CheckInput {
  sessionId: Hex;
  original: Uint8Array;
  anonymizedText: string;
  originalText: string;
  identity: Pick<IdentityRecord, "authorName" | "authorEmail" | "affiliation">;
}

@Injectable()
export class ChecksService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PLAGIARISM_PROVIDER) private readonly plagiarism: PlagiarismProvider,
    @Inject(PRIVATE_STORE) private readonly privateStore: PrivateStore,
  ) {}

  /** Memuat berkas dari storage privat lalu mengevaluasi. */
  async runForManuscript(manuscriptId: string, sessionId: Hex): Promise<CheckOutcome> {
    const [original, anonymized, identity] = await Promise.all([
      this.privateStore.get(refs.original(manuscriptId)),
      this.privateStore.get(refs.anonymizedStaging(manuscriptId)),
      getJson<IdentityRecord>(this.privateStore, refs.identity(manuscriptId)),
    ]);
    const [originalText, anonymizedText] = await Promise.all([extractPdfText(original), extractPdfText(anonymized)]);
    return this.evaluate({ sessionId, original, originalText, anonymizedText, identity });
  }

  async evaluate(input: CheckInput): Promise<CheckOutcome> {
    const info = await readPdfInfo(input.original);
    const score = await this.plagiarism.score(input.originalText);
    const exposedFields = findExposedIdentity(input.anonymizedText, input.identity);

    const flags: CheckFlags = {
      formatValid: info.readable,
      sizeValid: input.original.length > 0 && input.original.length < MAX_SIZE_BYTES,
      pageCountValid: info.pageCount > 0 && info.pageCount < MAX_PAGES_EXCLUSIVE,
      metadataPresent: info.title.trim() !== "" && info.keywords.trim() !== "",
      abstractPresent: info.subject.trim() !== "",
      identityExposed: exposedFields.length > 0,
      plagiarismBelowThreshold: score <= this.config.plagiarismThreshold,
    };

    let result: CheckReport["result"] = "Pass";
    if (!flags.formatValid || !flags.sizeValid || !flags.pageCountValid || !flags.plagiarismBelowThreshold) result = "Reject";
    else if (!flags.metadataPresent || !flags.abstractPresent) result = "Incomplete";

    const report: CheckReport = {
      schema: "decpub.automatic-check.v1",
      sessionId: input.sessionId,
      checkedAt: new Date().toISOString(),
      fileSize: input.original.length,
      pageCount: info.pageCount,
      flags,
      identityExposedFields: exposedFields,
      plagiarism: { provider: this.plagiarism.name, score, threshold: this.config.plagiarismThreshold },
      result,
      notes: "Pengecekan berbasis aturan (PoC). Peringatan identityExposed tidak mengubah hasil (keputusan B1).",
    };
    const reportBytes = new TextEncoder().encode(JSON.stringify(report));
    return {
      report,
      reportBytes,
      reportHash: keccak256(reportBytes),
      flagsHash: keccak256(toBytes(JSON.stringify(flags))),
      resultValue: AutomaticCheckResult[result],
    };
  }
}

/** Jenis identitas yang ditemukan di teks (huruf kecil, spasi dirapatkan). */
export function findExposedIdentity(
  text: string,
  identity: Pick<IdentityRecord, "authorName" | "authorEmail" | "affiliation">,
): string[] {
  const haystack = normalizeText(text);
  const out: string[] = [];
  for (const key of ["authorName", "authorEmail", "affiliation"] as const) {
    const needle = normalizeText(identity[key] ?? "");
    if (needle.length >= MIN_IDENTITY_LEN && haystack.includes(needle)) out.push(key);
  }
  return out;
}
