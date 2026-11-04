/**
 * Perhitungan CID. Dipakai simulator storage dan verifikasi klien.
 *
 * CIDv1 + codec raw (0x55) + sha-256. Sama dengan keluaran Kubo
 * (`--cid-version=1 --raw-leaves`) hanya untuk berkas satu chunk (<= 256 KiB).
 * Berkas lebih besar di Kubo menjadi DAG (dag-pb), jadi kode lain HARUS
 * memperlakukan CID sebagai nilai opaque dan menghitungnya lewat
 * `StorageProvider.cidOf`, bukan fungsi ini.
 */
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";

export const RAW_CODEC = 0x55;

export async function rawCidOf(bytes: Uint8Array): Promise<string> {
  const digest = await sha256.digest(bytes);
  return CID.createV1(RAW_CODEC, digest).toString();
}

/** Mengurai string CID. Mengembalikan null bila bukan CID yang sah. */
export function parseCid(value: string): CID | null {
  try {
    return CID.parse(value);
  } catch {
    return null;
  }
}

export function isValidCid(value: string): boolean {
  return parseCid(value) !== null;
}
