/**
 * demo:m1 - storage simulator.
 * Menyalakan simulator (dalam proses, data sementara), lalu membuktikan kriteria M1:
 * unggah, CID sama untuk isi sama, unduhan identik (sha256), CID tak dikenal 404.
 * Dipertahankan sebagai uji regresi (lihat docs/PLAN.md).
 */
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpStorageProvider, gatewayUrl, rawCidOf } from "@decpub/shared";
import { createStorageApp } from "@decpub/storage-sim";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
let failed = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "OK  " : "GAGAL"} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
}

/** PDF minimal yang sah, tanpa identitas apa pun di isi. */
function samplePdf(text: string): Uint8Array {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${`BT /F1 12 Tf 20 100 Td (${text}) Tj ET`.length} >>\nstream\nBT /F1 12 Tf 20 100 Td (${text}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

const dir = await mkdtemp(join(tmpdir(), "demo-m1-"));
const { app } = await createStorageApp({ dataDir: dir });
const server = app.listen(0, "127.0.0.1");
await new Promise((r) => server.once("listening", r));
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const config = { apiUrl: base, gatewayUrl: base };
const storage = new HttpStorageProvider(config);

try {
  console.log(`== demo:m1  simulator di ${base} [SIMULASI] ==`);
  const pdf = samplePdf("Naskah contoh anonim");

  const predicted = await storage.cidOf(pdf);
  check("cidOf tidak menyimpan", (await storage.stat(predicted)) === null, predicted);

  const { cid, size } = await storage.put(pdf, "naskah.pdf");
  check("put mengembalikan CID yang diprediksi cidOf", cid === predicted);
  check("CID cocok hitungan lokal (CIDv1 raw sha-256)", cid === (await rawCidOf(pdf)));
  check("ukuran sama", size === pdf.byteLength, `${size} byte`);

  const again = await storage.put(pdf, "nama-lain.pdf");
  check("berkas sama -> CID sama", again.cid === cid);

  const other = await storage.put(samplePdf("Naskah lain"), "lain.pdf");
  check("berkas beda -> CID beda", other.cid !== cid);

  const back = await storage.get(cid);
  check("unduhan identik (sha256 sama)", sha(back) === sha(pdf), sha(back).slice(0, 16) + "...");

  const unknown = await rawCidOf(new TextEncoder().encode("tidak pernah diunggah"));
  const res = await fetch(`${base}/ipfs/${unknown}`);
  check("CID tak dikenal -> HTTP 404", res.status === 404);
  check("stat CID tak dikenal -> null", (await storage.stat(unknown)) === null);

  const home = await (await fetch(base)).text();
  check("halaman HTML punya form unggah dan cari", home.includes('action="/upload"') && home.includes('name="cid"'));

  console.log(`\nTautan gateway: ${gatewayUrl(config, cid, { download: true, filename: "naskah.pdf" })}`);
} finally {
  server.close();
  await rm(dir, { recursive: true, force: true });
}

if (failed > 0) {
  console.error(`\n${failed} pemeriksaan gagal`);
  process.exit(1);
}
console.log("\nM1 OK");
