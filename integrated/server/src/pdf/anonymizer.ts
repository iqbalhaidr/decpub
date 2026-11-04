/**
 * Anonimisasi PDF (P04), port apa adanya dari Ciko
 * (`server/src/manuscripts/manuscripts-anonymization.service.ts:28-42`), keputusan B1:
 * hanya metadata dokumen dan halaman sampul. Isi halaman TIDAK disentuh, jadi nama yang
 * tertulis di isi naskah tetap terbaca. Batasan ini ditampilkan sebagai peringatan
 * `identityExposed` oleh pengecekan P03 (lihat `manuscripts/checks.service.ts`).
 *
 * Fungsi murni (byte masuk, byte keluar): tanpa berkas, tanpa jaringan.
 */
import { PDFDocument } from "pdf-lib";

export const ANONYMIZATION_RULES = ["metadata-stripping", "cover-page-overlay"] as const;

export interface AnonymizationResult {
  bytes: Uint8Array;
  rulesApplied: string[];
  /** Ringkasan teks (tanpa identitas apa pun). */
  report: string;
}

export async function anonymizePdf(input: Uint8Array): Promise<AnonymizationResult> {
  const pdfDoc = await PDFDocument.load(input);

  pdfDoc.setTitle("Anonymized Manuscript");
  pdfDoc.setAuthor("Anonymous");
  pdfDoc.setCreator("Anonymize Publication System PoC");
  pdfDoc.setProducer("Anonymize Publication System PoC");
  pdfDoc.setSubject("Triple-Blind Peer Review");
  pdfDoc.setKeywords([]);

  const page = pdfDoc.insertPage(0);
  page.drawText("Anonymized Manuscript", { x: 50, y: 700, size: 24 });
  page.drawText("Original identities have been removed from metadata.", { x: 50, y: 650, size: 12 });
  page.drawText("Target Redactions (Simulated via PoC Rules):", { x: 50, y: 600, size: 14 });
  page.drawText("- Author Name: [REDACTED]", { x: 50, y: 580, size: 12 });
  page.drawText("- Email: [REDACTED]", { x: 50, y: 560, size: 12 });
  page.drawText("- Affiliation: [REDACTED]", { x: 50, y: 540, size: 12 });

  const report = [
    "Anonymization report",
    "- PDF metadata (Author, Title, Creator, Producer, Subject, Keywords) replaced with neutral values.",
    "- Inserted anonymization cover page.",
    "- Note: page content is NOT modified (decision B1). Identity written in the body stays readable.",
  ].join("\n");

  return { bytes: await pdfDoc.save(), rulesApplied: [...ANONYMIZATION_RULES], report };
}
