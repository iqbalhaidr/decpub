/**
 * Storage privat: tempat naskah asli dan identitas penulis. TIDAK pernah publik.
 *
 * `PrivateStore` adalah antarmuka (arsitektur bagian 11); implementasi sekarang menyimpan
 * berkas terenkripsi AES-256-GCM di disk. Format berkas: iv(12) | tag(16) | ciphertext.
 * Nama berkas = sha256(ref) sehingga `ref` tidak pernah menjadi path (tanpa path traversal)
 * dan isi direktori tidak membocorkan nama berkas.
 *
 * Catatan: kunci ada di proses server (dari `PRIVATE_STORE_KEY`), jadi ini melindungi data
 * diam (disk, cadangan), bukan dari server itu sendiri. Server memang tepercaya untuk naskah
 * asli (model kepercayaan Ciko). Pengganti: KMS/HSM atau penyimpanan terenkripsi sisi klien.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface PrivateStore {
  put(ref: string, bytes: Uint8Array): Promise<void>;
  /** Melempar `PrivateStoreNotFoundError` bila tidak ada, `PrivateStoreTamperedError` bila rusak. */
  get(ref: string): Promise<Uint8Array>;
  has(ref: string): Promise<boolean>;
}

export const PRIVATE_STORE = Symbol("PRIVATE_STORE");

export class PrivateStoreNotFoundError extends Error {
  constructor(ref: string) {
    super(`Tidak ada di storage privat: ${ref}`);
    this.name = "PrivateStoreNotFoundError";
  }
}

export class PrivateStoreTamperedError extends Error {
  constructor(ref: string) {
    super(`Berkas privat rusak atau diubah (autentikasi GCM gagal): ${ref}`);
    this.name = "PrivateStoreTamperedError";
  }
}

export class EncryptedFilePrivateStore implements PrivateStore {
  private readonly key: Buffer;

  /** `keyHex`: 32 byte hex (0x...). */
  constructor(
    private readonly dir: string,
    keyHex: string,
  ) {
    this.key = Buffer.from(keyHex.replace(/^0x/, ""), "hex");
    if (this.key.length !== 32) throw new Error("Kunci storage privat harus 32 byte");
  }

  private path(ref: string): string {
    return join(this.dir, createHash("sha256").update(ref).digest("hex") + ".enc");
  }

  async put(ref: string, bytes: Uint8Array): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    // `ref` ikut diautentikasi: berkas yang dipindah ke ref lain gagal dibuka.
    cipher.setAAD(Buffer.from(ref));
    const ct = Buffer.concat([cipher.update(bytes), cipher.final()]);
    const target = this.path(ref);
    const tmp = `${target}.${process.pid}.tmp`;
    await writeFile(tmp, Buffer.concat([iv, cipher.getAuthTag(), ct]));
    await rename(tmp, target); // atomik
  }

  async get(ref: string): Promise<Uint8Array> {
    let raw: Buffer;
    try {
      raw = await readFile(this.path(ref));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new PrivateStoreNotFoundError(ref);
      throw e;
    }
    if (raw.length < 28) throw new PrivateStoreTamperedError(ref);
    const decipher = createDecipheriv("aes-256-gcm", this.key, raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(ref));
    decipher.setAuthTag(raw.subarray(12, 28));
    try {
      return new Uint8Array(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]));
    } catch {
      throw new PrivateStoreTamperedError(ref);
    }
  }

  async has(ref: string): Promise<boolean> {
    try {
      await readFile(this.path(ref));
      return true;
    } catch {
      return false;
    }
  }
}
