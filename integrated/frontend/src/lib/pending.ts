/**
 * Data commit telaah yang hanya ada di browser sampai reveal (arsitektur 8.3: server tidak melihat rekomendasi sebelum reveal).
 *
 * Kunci: akun + sesi + slot (nomor batch). Satu orang bisa punya beberapa ronde di sesi yang sama (revisi, zona abu-abu),
 * masing-masing dengan pseudonim sendiri (catatan M5). Kehilangan data ini sebelum reveal berarti telaah tidak bisa dibuka
 * (hash commit tidak bisa direkonstruksi), jadi halaman menyediakan ekspor.
 */
import type { Hex } from "viem";

export interface PendingReview {
  recommendation: number;
  text: string;
  reviewHash: Hex;
  reviewURI: string;
  reviewNonce: Hex;
  /** `sending`: disimpan sebelum permintaan commit dikirim; `committed`: server menerima; `revealed`: selesai. */
  status: "sending" | "committed" | "revealed";
  savedAt: string;
}

const key = (userId: string, sessionId: string, slot: number) => `decpub.review.${userId}.${sessionId.toLowerCase()}#${slot}`;

export function loadPending(userId: string, sessionId: string, slot: number): PendingReview | null {
  try {
    const raw = localStorage.getItem(key(userId, sessionId, slot));
    return raw ? (JSON.parse(raw) as PendingReview) : null;
  } catch {
    return null;
  }
}

export function savePending(userId: string, sessionId: string, slot: number, p: PendingReview): void {
  localStorage.setItem(key(userId, sessionId, slot), JSON.stringify(p));
}

export function removePending(userId: string, sessionId: string, slot: number): void {
  try {
    localStorage.removeItem(key(userId, sessionId, slot));
  } catch {
    /* abaikan */
  }
}

/** Catatan klaim reputasi yang sudah diantrikan dari browser ini (per sesi + slot), supaya tidak diajukan dua kali. */
const claimKey = (userId: string, sessionId: string, slot: number) => `decpub.repclaim.${userId}.${sessionId.toLowerCase()}#${slot}`;
export const reputationClaimed = (userId: string, sessionId: string, slot: number): string | null => {
  try {
    return localStorage.getItem(claimKey(userId, sessionId, slot));
  } catch {
    return null;
  }
};
export const markReputationClaimed = (userId: string, sessionId: string, slot: number, amount: string): void => localStorage.setItem(claimKey(userId, sessionId, slot), amount);
