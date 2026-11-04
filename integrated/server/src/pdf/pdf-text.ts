/**
 * Ekstraksi teks PDF sederhana: mengurai aliran konten halaman dan mengambil string operand
 * `Tj`/`TJ`. Cukup untuk PDF yang dibuat dengan font standar (sampel demo, pdf-lib) dan untuk
 * mendeteksi nama yang tertulis di isi. Bukan pengganti pdf.js: PDF dengan font tertanam
 * ber-encoding khusus menghasilkan teks kosong/acak, dan itu berarti `identityExposed` bisa
 * terlewat (galat negatif). Batasan ini sesuai B1 dan dicatat di PROGRESS.md.
 */
import { PDFArray, PDFDocument, PDFRawStream, PDFStream, decodePDFRawStream } from "pdf-lib";

const TOKEN = /\((?:\\[\s\S]|[^\\)])*\)|<(?!<)[0-9A-Fa-f\s]*>|\bT[jJ]\b|\bET\b|\bT\*|\bT[dD]\b/g;

function decodeLiteral(raw: string): string {
  const body = raw.slice(1, -1);
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = body[++i];
    if (n === undefined) break;
    if (/[0-7]/.test(n)) {
      let oct = n;
      while (oct.length < 3 && /[0-7]/.test(body[i + 1] ?? "")) oct += body[++i];
      out += String.fromCharCode(Number.parseInt(oct, 8));
    } else {
      out += ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[n] ?? n;
    }
  }
  return out;
}

function decodeHex(raw: string): string {
  const hex = raw.slice(1, -1).replace(/\s+/g, "");
  const padded = hex.length % 2 ? hex + "0" : hex;
  let out = "";
  for (let i = 0; i < padded.length; i += 2) out += String.fromCharCode(Number.parseInt(padded.slice(i, i + 2), 16));
  return out;
}

/** Teks dari satu aliran konten (sudah didekompresi). */
export function textFromContentStream(content: string): string {
  const parts: string[] = [];
  for (const m of content.matchAll(TOKEN)) {
    const t = m[0];
    if (t.startsWith("(")) parts.push(decodeLiteral(t));
    else if (t.startsWith("<")) parts.push(decodeHex(t));
    else if (t === "ET" || t === "T*" || t === "Td" || t === "TD") parts.push("\n");
  }
  return parts.join("");
}

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(bytes, { updateMetadata: false });
  } catch {
    return "";
  }
  const out: string[] = [];
  for (const page of doc.getPages()) {
    const contents = page.node.Contents();
    const streams: PDFStream[] = [];
    if (contents instanceof PDFArray) {
      for (let i = 0; i < contents.size(); i++) {
        const s = contents.lookup(i);
        if (s instanceof PDFStream) streams.push(s);
      }
    } else if (contents instanceof PDFStream) {
      streams.push(contents);
    }
    for (const s of streams) {
      try {
        const data = s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents();
        out.push(textFromContentStream(Buffer.from(data).toString("latin1")));
      } catch {
        /* aliran yang tak bisa didekode dilewati */
      }
    }
    out.push("\n");
  }
  return out.join("");
}

/** Huruf kecil, spasi dirapatkan: untuk pencarian identitas dan n-gram. */
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
