/**
 * Kripto sisi klien: secret identitas, pseudonim per sesi, nullifier, kredensial.
 * Dipakai bersama oleh frontend, skrip demo, dan `zk-sim` (yang menghitung ulang nilai
 * yang sama untuk memeriksa witness). Semua turunan memakai hash berdomain (`tagged`)
 * sehingga satu nilai tidak bisa dipakai di konteks lain.
 *
 * Alur kunci (docs/arsitektur.md A1, A4):
 *   secret (di browser, tidak pernah ke server)
 *     -> identityCommitment  = H(secret)                      didaftarkan di PermanentAccounts (P01)
 *     -> pseudonymKey        = H(secret, sesi, peran, slot)   kunci tanda tangan pseudonim
 *     -> nullifier           = H(secret, sesi, peran, slot)   satu pseudonim per orang per slot
 *     -> sessionCommitment   = H(secret, sesi, peran, slot, pseudonim)
 * Tanpa secret, tidak satu pun dari ketiga nilai terakhir bisa dihubungkan ke commitment permanen.
 */
import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  toBytes,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount, signMessage } from "viem/accounts";

/** Sama dengan `IEphemeralAccounts.Role`. */
export const Role = { Author: 0, Reviewer: 1, Editor: 2 } as const;
export type RoleValue = (typeof Role)[keyof typeof Role];
export const ROLE_NAMES = ["Author", "Reviewer", "Editor"] as const;

export function isRole(v: unknown): v is RoleValue {
  return v === 0 || v === 1 || v === 2;
}

const tag = (name: string): Hex => keccak256(toBytes(name));

/** keccak256(abi.encode(keccak256(tag), ...values)) */
function tagged(name: string, types: string, values: readonly unknown[]): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters(`bytes32, ${types}`), [tag(name), ...values] as never),
  );
}

/** Secret identitas 32 byte acak. Simpan hanya di sisi pemilik. */
export function generateSecret(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return toHex(b);
}

/** Commitment yang didaftarkan di `PermanentAccounts` (P01). */
export function identityCommitment(secret: Hex): Hex {
  return tagged("decpub.identity.v1", "bytes32", [secret]);
}

/** Identifier reputasi lintas sesi (A1), terpisah dari pseudonim. */
export function reputationId(secret: Hex): Hex {
  return tagged("decpub.reputation.v1", "bytes32", [secret]);
}

/**
 * Kunci privat pseudonim. Deterministik dari secret, sehingga bisa dipulihkan di browser.
 * `slot`: 0 untuk penulis dan editor; nomor batch seleksi untuk penelaah (B3: pseudonim
 * baru tiap putaran).
 */
export function pseudonymPrivateKey(secret: Hex, sessionId: Hex, role: RoleValue, slot = 0): Hex {
  return tagged("decpub.pseudonym.v1", "bytes32, bytes32, uint8, uint32", [secret, sessionId, role, slot]);
}

export function pseudonymAddress(secret: Hex, sessionId: Hex, role: RoleValue, slot = 0): Address {
  return privateKeyToAccount(pseudonymPrivateKey(secret, sessionId, role, slot)).address;
}

/** Nullifier pembuatan pseudonim: dipakai sekali per (secret, sesi, peran, slot). */
export function ephemeralNullifier(secret: Hex, sessionId: Hex, role: RoleValue, slot = 0): Hex {
  return tagged("decpub.nullifier.v1", "bytes32, bytes32, uint8, uint32", [secret, sessionId, role, slot]);
}

/** Nilai yang disimpan `EphemeralAccounts` sebagai `sessionCommitment`. */
export function ephemeralSessionCommitment(
  secret: Hex,
  sessionId: Hex,
  role: RoleValue,
  slot: number,
  pseudonym: Address,
): Hex {
  return tagged("decpub.session-commitment.v1", "bytes32, bytes32, uint8, uint32, address", [
    secret,
    sessionId,
    role,
    slot,
    pseudonym,
  ]);
}

/** Semua nilai publik pembuatan pseudonim, dihitung dari secret. */
export function deriveEphemeral(secret: Hex, sessionId: Hex, role: RoleValue, slot = 0) {
  const key = pseudonymPrivateKey(secret, sessionId, role, slot);
  const pseudonym = privateKeyToAccount(key).address;
  return {
    privateKey: key,
    pseudonym,
    nullifier: ephemeralNullifier(secret, sessionId, role, slot),
    sessionCommitment: ephemeralSessionCommitment(secret, sessionId, role, slot, pseudonym),
  };
}

/**
 * Commitment penugasan penelaah: dihitung server saat seleksi dari salt undangan, dicatat
 * on-chain, lalu penelaah membuktikan kepemilikannya dengan salt yang sama.
 */
export function assignmentCommitment(sessionId: Hex, inviteSalt: Hex): Hex {
  return tagged("decpub.assignment.v1", "bytes32, bytes32", [sessionId, inviteSalt]);
}

// ---------------------------------------------------------------- kredensial

/**
 * Kredensial peran: tanda tangan penerbit (server) atas (identityCommitment, peran).
 * Penerbit tahu siapa penerima, tetapi kredensial hanya dipakai sebagai witness bukti ZK,
 * tidak pernah muncul on-chain. Kredensial bidang keahlian (`fieldCredentialDigest`) memakai
 * pola yang sama dan dipakai bukti `ASSIGNMENT` di M4.
 */
export function credentialDigest(commitment: Hex, role: RoleValue): Hex {
  return tagged("decpub.credential.v1", "bytes32, uint8", [commitment, role]);
}

export async function issueRoleCredential(
  issuerPrivateKey: Hex,
  commitment: Hex,
  role: RoleValue,
): Promise<Hex> {
  return signMessage({
    privateKey: issuerPrivateKey,
    message: { raw: credentialDigest(commitment, role) },
  });
}

/**
 * Kredensial bidang keahlian: tanda tangan penerbit atas (identityCommitment, bidang).
 * Diterbitkan setelah admin menyetujui permintaan verifikasi bidang (P01/P06).
 */
export function fieldCredentialDigest(commitment: Hex, field: string): Hex {
  return tagged("decpub.field-credential.v1", "bytes32, bytes32", [commitment, keccak256(toBytes(field))]);
}

export async function issueFieldCredential(issuerPrivateKey: Hex, commitment: Hex, field: string): Promise<Hex> {
  return signMessage({
    privateKey: issuerPrivateKey,
    message: { raw: fieldCredentialDigest(commitment, field) },
  });
}

/**
 * Alamat akun permanen untuk dompet dev lokal: turunan dari secret, sehingga pengguna tanpa
 * MetaMask tetap punya alamat untuk `PermanentAccounts` dan (M6) penyetor APC. Alamat ini
 * TERHUBUNG ke identitas by design (akun permanen); yang tidak terhubung adalah pseudonim sesi.
 */
export function permanentAccountKey(secret: Hex): Hex {
  return tagged("decpub.permanent-account.v1", "bytes32", [secret]);
}

export function permanentAccountAddress(secret: Hex): Address {
  return privateKeyToAccount(permanentAccountKey(secret)).address;
}
