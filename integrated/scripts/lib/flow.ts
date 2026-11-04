/**
 * Langkah alur yang dipakai bersama oleh demo milestone dan (M12) skenario S1-S6. Semuanya hanya
 * berbicara lewat `Api`/`Member` (HTTP + `packages/shared`), seperti browser: tidak ada akses
 * langsung ke DB atau kunci server.
 */
import type { Hex } from "viem";
import { DeskDecision, type RecommendationValue } from "@decpub/shared";
import type { Api } from "./api.ts";
import type { Invite, Member } from "./member.ts";

export interface Seat {
  m: Member;
  invite: Invite;
}

/** Undangan editor untuk sebuah sesi, dicari di kotak masuk semua kandidat. */
export async function findEditorSeat(editors: Member[], sessionId: Hex): Promise<Seat> {
  const seats: Seat[] = [];
  for (const m of editors) for (const i of await m.inbox()) if (i.sessionId === sessionId && i.role === "editor") seats.push({ m, invite: i });
  if (seats.length !== 1) throw new Error(`Seharusnya tepat satu undangan editor untuk ${sessionId}, ditemukan ${seats.length}`);
  return seats[0];
}

/** Undangan penelaah sebuah batch (slot), dicari di kotak masuk semua anggota. */
export async function findReviewerSeats(members: Member[], sessionId: Hex, slot: number): Promise<Seat[]> {
  const seats: Seat[] = [];
  for (const m of members) for (const i of await m.inbox()) if (i.sessionId === sessionId && i.role === "reviewer" && i.slot === slot) seats.push({ m, invite: i });
  return seats;
}

/** Semua penelaah di `seats` menerima undangan (pseudonim baru + pengikatan). */
export async function bindAll(seats: Seat[]) {
  const out = [];
  for (const s of seats) out.push(await s.m.acceptReviewerInvite(s.invite));
  return out;
}

const REVIEW_TEXTS = [
  "Metodologi jelas dan hasil dapat direproduksi. Saya menyarankan menambahkan analisis sensitivitas terhadap ambang.",
  "Kontribusi relevan dengan alur telaah buta; sebaiknya bandingkan dengan baseline tanpa commit-reveal.",
  "Naskah ditulis baik. Perbaiki penjelasan pada bagian evaluasi agar mudah diikuti.",
  "Klaim pada bagian hasil perlu dukungan data tambahan. Tambahkan uji statistik dan jelaskan batasan.",
  "Struktur argumen kuat. Sebaiknya rapikan sitasi dan tambahkan diskusi ancaman validitas.",
];
export const reviewText = (tag: string, i: number) => `${REVIEW_TEXTS[i % REVIEW_TEXTS.length]} [${tag}]`;

/** Semua commit dengan rekomendasi `recs` (urutan sesuai `seats`), lalu semua reveal. Mengembalikan balasan reveal terakhir. */
export async function commitAndRevealAll(seats: Seat[], recs: RecommendationValue[], tag: string) {
  for (let i = 0; i < seats.length; i++) await seats[i].m.commitReview(seats[i].invite, recs[i], reviewText(tag, i));
  let last: any;
  for (const s of seats) last = await s.m.revealReview(s.invite);
  return last;
}

/** Editor menerima undangan lalu memutus Proceed (ke pemilihan penelaah). */
export async function editorAcceptAndProceed(seat: Seat, sessionId: Hex, comments: string, fields = ["ai"]) {
  const accepted = await seat.m.acceptEditorInvite(seat.invite);
  const screen = await seat.m.screen(sessionId, { decision: DeskDecision.ProceedToReviewerSelection, comments, reviewerFields: fields, privateNotes: "catatan internal editor" });
  return { accepted, screen };
}

export interface TrailEntry {
  order: number;
  blockNumber: number;
  logIndex: number;
  event: string;
  summary: string;
  args: Record<string, any>;
}

export async function auditTrail(api: Api, sessionId: Hex): Promise<TrailEntry[]> {
  return (await api.get(`/public/sessions/${sessionId}/audit-trail`)).entries;
}

/** Jejak status dari event `PublicationStatusUpdated`: nama status tujuan, berurutan. */
export function statusPath(trail: TrailEntry[]): string[] {
  return trail.filter((e) => e.event === "PublicationStatusUpdated").map((e) => e.summary.split("→")[1]!.trim());
}

/** Jejak status mulai dari `UnderAnonymization` (hasil P03 tidak relevan bagi jalur telaah). */
export function reviewStatusPath(trail: TrailEntry[]): string[] {
  const p = statusPath(trail);
  const i = p.indexOf("UnderAnonymization");
  return i < 0 ? p : p.slice(i);
}
