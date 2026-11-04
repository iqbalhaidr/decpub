/**
 * Penyimpanan secret identitas di browser (keputusan A4: secret tidak pernah dikirim ke server).
 *
 * Satu secret per akun operasional. Kehilangan secret = kehilangan kemampuan membuat pseudonim dan
 * mengklaim imbalan; tidak ada pemulihan di server. Pengguna wajib mengekspornya.
 * Dipakai oleh /profile (M9) dan halaman penulis/penelaah (M10, M11).
 */
import { generateSecret, identityCommitment, permanentAccountAddress } from "@decpub/shared";
import type { Hex } from "viem";

const key = (userId: string) => `decpub.secret.${userId}`;

export const isSecret = (v: string): v is Hex => /^0x[0-9a-fA-F]{64}$/.test(v);

export function loadSecret(userId: string): Hex | null {
  try {
    const v = localStorage.getItem(key(userId));
    return v && isSecret(v) ? v : null;
  } catch {
    return null;
  }
}

export function saveSecret(userId: string, secret: Hex): void {
  localStorage.setItem(key(userId), secret);
}

export function removeSecret(userId: string): void {
  try {
    localStorage.removeItem(key(userId));
  } catch {
    /* abaikan */
  }
}

/** Secret baru (belum disimpan). */
export const newSecret = (): Hex => generateSecret();

/** Nilai publik yang diturunkan dari secret: commitment untuk PermanentAccounts dan alamat akun permanen dev. */
export function publicIdentity(secret: Hex): { commitment: Hex; permanentAddress: string } {
  return { commitment: identityCommitment(secret), permanentAddress: permanentAccountAddress(secret) };
}
