/**
 * Pemuatan kunci penandatangan layanan (attestor ZK dan penerbit kredensial).
 *
 * Lokal: bila env tidak diisi, kunci diturunkan deterministik dari label sehingga
 * `npm run demo` jalan tanpa konfigurasi. Kunci turunan itu PUBLIK (ada di kode ini),
 * jadi hanya sah untuk jaringan lokal. Di Sepolia env wajib diisi (M13).
 */
import { keccak256, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

type Env = Record<string, string | undefined>;

function isPublicNetwork(env: Env): boolean {
  const n = (env.NETWORK ?? "localhost").toLowerCase();
  return n !== "localhost" && n !== "hardhat";
}

/** Kunci dev deterministik. Jangan dipakai di jaringan publik. */
export function devPrivateKey(label: string): Hex {
  return keccak256(toHex(`decpub dev key v1: ${label}`));
}

/**
 * Baca kunci privat dari env `name`. Bila kosong: di jaringan lokal pakai kunci dev,
 * di jaringan publik gagal.
 */
export function loadPrivateKey(name: string, label: string, env: Env = process.env): Hex {
  const v = env[name]?.trim();
  if (v) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(v)) throw new Error(`${name} bukan kunci privat 32 byte hex`);
    return v as Hex;
  }
  if (isPublicNetwork(env)) {
    throw new Error(`${name} wajib diisi untuk jaringan ${env.NETWORK} (kunci dev hanya untuk lokal)`);
  }
  return devPrivateKey(label);
}

/** Alamat attestor ZK-sim (penanda tangan bukti simulasi). */
export function attestorAddress(env: Env = process.env): Hex {
  return privateKeyToAccount(loadPrivateKey("ATTESTOR_PRIVATE_KEY", "zk attestor", env)).address;
}

/** Alamat penerbit kredensial peran/bidang (server pada M3). */
export function issuerAddress(env: Env = process.env): Hex {
  return privateKeyToAccount(loadPrivateKey("ISSUER_PRIVATE_KEY", "credential issuer", env)).address;
}
