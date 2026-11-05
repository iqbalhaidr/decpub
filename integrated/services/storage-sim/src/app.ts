/**
 * Simulator IPFS: subset API Kubo + halaman HTML.
 *
 *   POST /api/v0/add?only-hash=   multipart (field mana pun), balasan NDJSON {Name, Hash, Size}
 *   GET|HEAD /ipfs/:cid[?download=1&filename=x]
 *   GET /?cid=...                 halaman cari
 *   POST /upload                  form HTML
 *
 * Status: 400 CID tak sah, 404 CID sah tapi tidak dikenal.
 */
import express, { type Express, type Request, type Response } from "express";
import multer from "multer";
import { isValidCid } from "@decpub/shared";
import { BlobStore } from "./store.js";
import { foundPage, homePage, messagePage, uploadedPage } from "./html.js";

export interface StorageSimOptions {
  dataDir: string;
  /** Batas ukuran satu berkas (byte). Bawaan 50 MiB. */
  maxBytes?: number;
  /**
   * Asal browser yang boleh memanggil API storage langsung. Frontend menghitung CID dokumen telaah di browser
   * (`add?only-hash=true`) supaya teks telaah tidak lewat server sebelum reveal. Kosong = tanpa header CORS.
   * Pada Kubo, setara `API.HTTPHeaders.Access-Control-Allow-Origin`.
   */
  corsOrigins?: string[];
}

/** Asal bawaan: frontend lokal. Dipisahkan koma pada env `STORAGE_CORS_ORIGIN`. */
export function corsOriginsFromEnv(env: Record<string, string | undefined> = process.env): string[] {
  return (env.STORAGE_CORS_ORIGIN ?? env.CORS_ORIGIN ?? "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createStorageApp(opts: StorageSimOptions): Promise<{ app: Express; store: BlobStore }> {
  const store = new BlobStore(opts.dataDir);
  await store.init();

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: opts.maxBytes ?? 50 * 1024 * 1024, files: 20 },
  });

  const app = express();
  app.disable("x-powered-by");

  // CORS sederhana tanpa dependensi: hanya asal terdaftar yang diberi header (halaman HTML simulator tidak butuh CORS).
  const allowed = new Set(opts.corsOrigins ?? []);
  app.use((req: Request, res: Response, next) => {
    const origin = req.headers.origin;
    if (origin && allowed.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "content-type");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // ---- API gaya Kubo ----
  app.post("/api/v0/add", upload.any(), async (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      res.status(400).json({ Message: "tidak ada berkas (multipart field 'file')", Code: 0, Type: "error" });
      return;
    }
    const onlyHash = req.query["only-hash"] === "true";
    res.type("application/json");
    const lines: string[] = [];
    for (const f of files) {
      const bytes = new Uint8Array(f.buffer);
      const cid = onlyHash ? await store.hash(bytes) : (await store.put(bytes, f.originalname)).cid;
      lines.push(JSON.stringify({ Name: f.originalname, Hash: cid, Size: String(bytes.byteLength) }));
    }
    res.send(lines.join("\n") + "\n");
  });

  // ---- Gateway ----
  const serve = async (req: Request, res: Response) => {
    const cid = String(req.params.cid);
    if (!isValidCid(cid)) {
      res.status(400).type("text/plain").send("CID tidak sah");
      return;
    }
    const bytes = await store.get(cid);
    if (!bytes) {
      res.status(404).type("text/plain").send("CID tidak ditemukan");
      return;
    }
    res.set({
      "Content-Type": looksLikePdf(bytes) ? "application/pdf" : "application/octet-stream",
      "Content-Length": String(bytes.byteLength),
      // Isi dari pengguna: jangan pernah dieksekusi sebagai halaman.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      // Content-addressed, jadi tidak pernah berubah.
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${cid}"`,
    });
    if (req.query.download === "1") {
      const name = safeFilename(typeof req.query.filename === "string" ? req.query.filename : cid);
      res.set("Content-Disposition", `attachment; filename="${name}"`);
    }
    res.status(200);
    if (req.method === "HEAD") res.end();
    else res.end(Buffer.from(bytes));
  };
  app.get("/ipfs/:cid", serve);
  app.head("/ipfs/:cid", serve);

  // ---- Halaman HTML ----
  app.get("/", async (req: Request, res: Response) => {
    const cid = typeof req.query.cid === "string" ? req.query.cid.trim() : "";
    if (!cid) {
      res.type("html").send(homePage());
      return;
    }
    if (!isValidCid(cid)) {
      res.status(400).type("html").send(messagePage(`ID tidak sah: ${cid}`));
      return;
    }
    const s = await store.statFile(cid);
    if (!s) {
      res.status(404).type("html").send(messagePage(`ID tidak ditemukan: ${cid}`));
      return;
    }
    const meta = await store.meta(cid);
    res.type("html").send(foundPage({ cid, size: s.size, name: meta?.name }));
  });

  app.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).type("html").send(messagePage("Pilih berkas terlebih dahulu."));
      return;
    }
    const r = await store.put(new Uint8Array(req.file.buffer), req.file.originalname);
    res.type("html").send(uploadedPage({ cid: r.cid, size: r.size, name: req.file.originalname }, r.created));
  });

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, service: "storage-sim" });
  });

  // Penanganan galat (mis. berkas melebihi batas).
  app.use((err: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    if (err instanceof multer.MulterError) {
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      res.status(status).json({ Message: err.message, Code: 0, Type: "error" });
      return;
    }
    console.error("[storage-sim] galat tak terduga:", err instanceof Error ? err.message : err);
    res.status(500).json({ Message: "galat internal", Code: 0, Type: "error" });
  });

  return { app, store };
}

function looksLikePdf(b: Uint8Array): boolean {
  return b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d;
}

function safeFilename(name: string): string {
  const cleaned = name.replace(/[^\w.\- ]+/g, "_").slice(0, 120);
  return cleaned || "download";
}
