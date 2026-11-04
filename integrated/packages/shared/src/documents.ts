/**
 * Dokumen yang hash dan CID-nya dicatat on-chain: laporan editorial (P05) dan laporan telaah (P07).
 * Serialisasi dibuat deterministik dan SAMA di klien dan server, sehingga hash yang ditandatangani
 * klien dapat diperiksa server tanpa menerima byte mentah dari klien.
 */
import { keccak256, toBytes, type Hex } from "viem";
import { canonicalCriteria } from "./selection.js";
import { DESK_DECISION_NAMES } from "./status.js";

const enc = (v: unknown) => toBytes(JSON.stringify(v));

// ------------------------------------------------------------------ telaah

export const MAX_REVIEW_CHARS = 20_000;

/** Isi laporan telaah. Rekomendasi sengaja tidak di dalamnya: ia hanya dibuka lewat reveal. */
export function reviewDocument(sessionId: Hex, text: string): Uint8Array {
  return enc({ version: 1, kind: "peer-review", sessionId: sessionId.toLowerCase(), text });
}

export function reviewHash(sessionId: Hex, text: string): Hex {
  return keccak256(reviewDocument(sessionId, text));
}

// --------------------------------------------------------------- editorial

export const MAX_EDITORIAL_CHARS = 20_000;

export interface EditorialReportInput {
  sessionId: Hex;
  /** Nomor revisi sesi saat penyaringan (`revisionCount`). */
  revision: number;
  /** 1 Proceed, 2 Revise, 3 DeskReject (`DeskDecision`). */
  decision: number;
  comments: string;
  /** Kriteria bidang penelaah. Hanya bermakna untuk keputusan Proceed. */
  reviewerFields: readonly string[];
  /** Catatan untuk arsip internal; tidak pernah masuk laporan publik. */
  privateNotes?: string;
}

/**
 * Dua dokumen: yang publik (tanpa catatan internal; CID-nya dicatat di `anonymousEditorialReportURI`)
 * dan yang lengkap (disimpan terenkripsi di storage privat server; hash-nya `editorialReportHash`).
 */
export function editorialReportDocuments(i: EditorialReportInput): { publicBytes: Uint8Array; fullBytes: Uint8Array } {
  const pub = {
    version: 1,
    kind: "editorial-report",
    sessionId: i.sessionId.toLowerCase(),
    revision: i.revision,
    decision: DESK_DECISION_NAMES[i.decision] ?? String(i.decision),
    comments: i.comments,
    reviewerCriteria: canonicalCriteria(i.reviewerFields),
  };
  return { publicBytes: enc(pub), fullBytes: enc({ public: pub, privateNotes: i.privateNotes ?? "" }) };
}

export function editorialReportHashes(i: EditorialReportInput): { editorialReportHash: Hex; anonymousEditorialReportHash: Hex } {
  const { publicBytes, fullBytes } = editorialReportDocuments(i);
  return { editorialReportHash: keccak256(fullBytes), anonymousEditorialReportHash: keccak256(publicBytes) };
}
