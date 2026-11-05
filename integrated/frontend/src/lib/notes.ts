/**
 * Note APC milik penulis, disimpan di browser (keputusan A2: rahasia note tidak pernah ke server).
 *
 * Satu daftar per akun operasional di localStorage. Rahasia note hilang = APC hilang (tidak ada jalur
 * penyelamatan oleh admin, sengaja), jadi halaman /author/apc menyediakan ekspor dan impor.
 * Catatan "terikat ke sesi" hanya ada di browser ini; chain tidak mengaitkan note dengan sesi secara publik.
 */
import type { Address, Hex } from "viem";

export interface StoredNote {
  secret: Hex;
  commitment: Hex;
  /** `pending`: disimpan sebelum transaksi setor dikirim, supaya tab yang tertutup tidak menghilangkan dana. */
  status: "pending" | "deposited";
  payer?: Address;
  depositTx?: Hex;
  createdAt: string;
  /** Sesi tempat note ini diikat dari browser ini. */
  boundSession?: Hex;
}

const key = (userId: string) => `decpub.notes.${userId}`;

export function loadNotes(userId: string): StoredNote[] {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? (JSON.parse(raw) as StoredNote[]) : [];
  } catch {
    return [];
  }
}

export function saveNotes(userId: string, notes: StoredNote[]): void {
  localStorage.setItem(key(userId), JSON.stringify(notes));
}

/** Memperbarui satu note (dicari lewat rahasia) dan menyimpan daftar. Mengembalikan daftar baru. */
export function updateNote(userId: string, secret: Hex, patch: Partial<StoredNote>): StoredNote[] {
  const next = loadNotes(userId).map((n) => (n.secret.toLowerCase() === secret.toLowerCase() ? { ...n, ...patch } : n));
  saveNotes(userId, next);
  return next;
}

export function addNote(userId: string, note: StoredNote): StoredNote[] {
  const next = [...loadNotes(userId).filter((n) => n.secret.toLowerCase() !== note.secret.toLowerCase()), note];
  saveNotes(userId, next);
  return next;
}

export const noteOfSession = (userId: string, sessionId: string): StoredNote | undefined =>
  loadNotes(userId).find((n) => n.boundSession?.toLowerCase() === sessionId.toLowerCase());

/** Note yang sudah disetor dan belum diikat dari browser ini (belum tentu belum dipakai di chain; lihat `noteSpent`). */
export const spareNotes = (userId: string): StoredNote[] => loadNotes(userId).filter((n) => n.status === "deposited" && !n.boundSession);
