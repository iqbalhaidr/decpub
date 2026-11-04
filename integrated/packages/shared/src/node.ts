/**
 * Pembantu khusus Node (membaca berkas). Dipisah dari `index.ts` agar frontend tidak ikut
 * membawa `node:fs`. Impor lewat `@decpub/shared/node`.
 */
import { readFileSync } from "node:fs";
import type { Address } from "viem";

/** Isi `contracts/deployments/<jaringan>.json` (ditulis `export-addresses.ts`). */
export type Deployments = {
  network: string;
  chainId: number;
  contracts: Record<string, Address>;
};

export function readDeployments(file: string): Deployments {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`Tidak bisa membaca deployments ${file}. Jalankan "npm run deploy:local" dulu. (${(e as Error).message})`);
  }
  const d = raw as Deployments;
  if (!d || typeof d.chainId !== "number" || typeof d.contracts !== "object") {
    throw new Error(`Format deployments tidak sah: ${file}`);
  }
  return d;
}

/** Alamat kontrak bernama, atau galat yang jelas bila belum di-deploy. */
export function contractAddress(d: Deployments, name: string): Address {
  const a = d.contracts[name];
  if (!a) throw new Error(`Kontrak ${name} tidak ada di deployments ${d.network}. Deploy ulang.`);
  return a;
}
