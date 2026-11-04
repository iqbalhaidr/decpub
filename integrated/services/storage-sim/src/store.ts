/**
 * Penyimpanan berkas content-addressed di disk.
 * Layout: <dir>/<cid>        isi berkas
 *         <dir>/<cid>.json   metadata ({name, size, addedAt}); hanya untuk tampilan
 * CID menjadi nama berkas, jadi CID yang tidak lolos validasi tidak pernah menyentuh disk
 * (tidak ada path traversal).
 */
import { mkdir, readFile, stat, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { isValidCid, rawCidOf } from "@decpub/shared";

export interface BlobMeta {
  name: string;
  size: number;
  addedAt: string;
}

export class BlobStore {
  constructor(private readonly dir: string) {}

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
  }

  private path(cid: string): string {
    if (!isValidCid(cid) || cid.includes("/") || cid.includes("\\") || cid.includes("..")) {
      throw new Error("CID tidak sah");
    }
    return join(this.dir, cid);
  }

  /** Hitung CID tanpa menyimpan. */
  async hash(bytes: Uint8Array): Promise<string> {
    return rawCidOf(bytes);
  }

  /** Simpan; idempoten (isi sama -> CID sama -> tidak menulis ulang). */
  async put(bytes: Uint8Array, name: string): Promise<{ cid: string; size: number; created: boolean }> {
    const cid = await rawCidOf(bytes);
    const file = this.path(cid);
    if (await this.has(cid)) return { cid, size: bytes.byteLength, created: false };
    // Tulis ke berkas sementara lalu rename, supaya pembaca tidak melihat berkas separuh.
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, file);
    const meta: BlobMeta = { name, size: bytes.byteLength, addedAt: new Date().toISOString() };
    await writeFile(`${file}.json`, JSON.stringify(meta));
    return { cid, size: bytes.byteLength, created: true };
  }

  async has(cid: string): Promise<boolean> {
    return (await this.statFile(cid)) !== null;
  }

  async statFile(cid: string): Promise<{ size: number } | null> {
    try {
      const s = await stat(this.path(cid));
      return s.isFile() ? { size: s.size } : null;
    } catch {
      return null;
    }
  }

  async get(cid: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.path(cid)));
    } catch {
      return null;
    }
  }

  async meta(cid: string): Promise<BlobMeta | null> {
    try {
      return JSON.parse(await readFile(`${this.path(cid)}.json`, "utf8")) as BlobMeta;
    } catch {
      return null;
    }
  }
}
