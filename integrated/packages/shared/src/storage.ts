/**
 * StorageProvider: antarmuka storage publik (pengganti IPFS).
 *
 * Bentuknya mengikuti subset API Kubo:
 *   POST {api}/api/v0/add            (multipart, field "file")
 *   GET|HEAD {gateway}/ipfs/{cid}
 * sehingga mengganti simulator dengan node Kubo cukup mengubah env
 * STORAGE_API_URL dan STORAGE_GATEWAY_URL (lihat docs/arsitektur.md bagian 11).
 */
import { RAW_CODEC, parseCid, rawCidOf } from "./cid.js";

export interface StorageProvider {
  /** CID yang akan didapat bila `bytes` diunggah, tanpa menyimpan (Kubo: add?only-hash=true). */
  cidOf(bytes: Uint8Array): Promise<string>;
  put(bytes: Uint8Array, filename: string): Promise<{ cid: string; size: number }>;
  get(cid: string): Promise<Uint8Array>;
  /** null bila CID tidak dikenal. */
  stat(cid: string): Promise<{ size: number } | null>;
}

export class StorageNotFoundError extends Error {
  constructor(public readonly cid: string) {
    super(`CID tidak ditemukan di storage: ${cid}`);
    this.name = "StorageNotFoundError";
  }
}

export class StorageIntegrityError extends Error {
  constructor(
    public readonly cid: string,
    public readonly actual: string,
  ) {
    super(`Isi berkas tidak cocok dengan CID ${cid} (hash isi: ${actual})`);
    this.name = "StorageIntegrityError";
  }
}

export interface StorageConfig {
  /** Basis API tulis, mis. http://127.0.0.1:8081 (simulator) atau http://127.0.0.1:5001 (Kubo). */
  apiUrl: string;
  /** Basis gateway baca tanpa "/ipfs", mis. http://127.0.0.1:8081 atau http://127.0.0.1:8080. */
  gatewayUrl: string;
}

export const DEFAULT_STORAGE_URL = "http://127.0.0.1:8081";

export function storageConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): StorageConfig {
  const strip = (u: string) => u.replace(/\/+$/, "");
  return {
    apiUrl: strip(env.STORAGE_API_URL || DEFAULT_STORAGE_URL),
    gatewayUrl: strip(env.STORAGE_GATEWAY_URL || env.STORAGE_API_URL || DEFAULT_STORAGE_URL),
  };
}

/** Tautan gateway untuk satu CID (dipakai UI dan laporan). */
export function gatewayUrl(config: StorageConfig, cid: string, opts?: { download?: boolean; filename?: string }): string {
  const base = `${config.gatewayUrl}/ipfs/${cid}`;
  const params = new URLSearchParams();
  if (opts?.download) params.set("download", "1");
  if (opts?.filename) params.set("filename", opts.filename);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

interface AddResponse {
  Name: string;
  Hash: string;
  Size: string;
}

/**
 * Klien HTTP untuk simulator maupun Kubo. `fetch` dan timeout bisa diganti untuk tes.
 */
export class HttpStorageProvider implements StorageProvider {
  constructor(
    private readonly config: StorageConfig,
    private readonly opts: { timeoutMs?: number } = {},
  ) {}

  private signal(): AbortSignal {
    return AbortSignal.timeout(this.opts.timeoutMs ?? 15_000);
  }

  private async add(bytes: Uint8Array, filename: string, onlyHash: boolean): Promise<AddResponse> {
    const form = new FormData();
    form.append("file", new Blob([bytes as BlobPart]), filename);
    const params = new URLSearchParams({
      "cid-version": "1",
      "raw-leaves": "true",
      pin: "true",
      "only-hash": String(onlyHash),
    });
    const res = await fetch(`${this.config.apiUrl}/api/v0/add?${params}`, {
      method: "POST",
      body: form,
      signal: this.signal(),
    });
    if (!res.ok) {
      throw new Error(`Storage add gagal (${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    // Kubo membalas NDJSON, satu baris per berkas. Kita hanya mengirim satu.
    const lines = (await res.text()).trim().split("\n");
    return JSON.parse(lines[lines.length - 1]) as AddResponse;
  }

  async cidOf(bytes: Uint8Array): Promise<string> {
    return (await this.add(bytes, "hash-only", true)).Hash;
  }

  async put(bytes: Uint8Array, filename: string): Promise<{ cid: string; size: number }> {
    const r = await this.add(bytes, filename, false);
    return { cid: r.Hash, size: bytes.byteLength };
  }

  async get(cid: string): Promise<Uint8Array> {
    const res = await fetch(`${this.config.gatewayUrl}/ipfs/${encodeURIComponent(cid)}`, {
      signal: this.signal(),
    });
    if (res.status === 404) throw new StorageNotFoundError(cid);
    if (!res.ok) throw new Error(`Storage get gagal (${res.status})`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    await verifyIfRaw(cid, bytes);
    return bytes;
  }

  async stat(cid: string): Promise<{ size: number } | null> {
    const res = await fetch(`${this.config.gatewayUrl}/ipfs/${encodeURIComponent(cid)}`, {
      method: "HEAD",
      signal: this.signal(),
    });
    if (res.status === 404 || res.status === 400) return null;
    if (!res.ok) throw new Error(`Storage stat gagal (${res.status})`);
    const len = res.headers.get("content-length");
    return { size: len === null ? 0 : Number(len) };
  }
}

/**
 * Gateway tidak tepercaya: untuk CID raw, hash isi diperiksa ulang.
 * CID dag-pb (berkas besar di Kubo) tidak bisa diperiksa tanpa membongkar DAG,
 * jadi dilewati.
 */
async function verifyIfRaw(cid: string, bytes: Uint8Array): Promise<void> {
  const parsed = parseCid(cid);
  if (!parsed || parsed.code !== RAW_CODEC) return;
  const actual = await rawCidOf(bytes);
  if (actual !== parsed.toString()) throw new StorageIntegrityError(cid, actual);
}

export function createStorageProvider(config: StorageConfig = storageConfigFromEnv()): StorageProvider {
  return new HttpStorageProvider(config);
}
