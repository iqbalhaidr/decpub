/** Membaca metadata dokumen PDF yang dipakai pengecekan P03. */
import { PDFDocument } from "pdf-lib";

export interface PdfInfo {
  readable: boolean;
  pageCount: number;
  title: string;
  author: string;
  keywords: string;
  subject: string;
}

export async function readPdfInfo(bytes: Uint8Array): Promise<PdfInfo> {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return {
      readable: true,
      pageCount: doc.getPageCount(),
      title: doc.getTitle() ?? "",
      author: doc.getAuthor() ?? "",
      keywords: doc.getKeywords() ?? "",
      subject: doc.getSubject() ?? "",
    };
  } catch {
    return { readable: false, pageCount: 0, title: "", author: "", keywords: "", subject: "" };
  }
}

/** Tanda `%PDF-` di awal berkas. Pemeriksaan murah sebelum mem-parse. */
export function looksLikePdf(bytes: Uint8Array): boolean {
  return bytes.length >= 5 && String.fromCharCode(...bytes.subarray(0, 5)) === "%PDF-";
}
