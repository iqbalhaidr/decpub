/**
 * Seleksi editor dan penelaah (P05-P06), dijalankan sistem, bukan editor.
 *
 *  - Editor: acak di antara editor terdaftar yang bidangnya sama dengan kategori jurnal.
 *  - Penelaah: acak di antara penelaah dengan bidang terverifikasi yang masuk kriteria editor,
 *    tidak termasuk penulis naskah dan tidak termasuk yang sudah diundang pada sesi ini.
 *
 * Tiap undangan membawa `inviteSalt` rahasia penerimanya. `assignmentCommitment = H(sesi, salt)`
 * dicatat on-chain; bukti ASSIGNMENT (simulasi) menyatakan kandidat memenuhi kriteria dan
 * diunggah ke storage publik, hash-nya menjadi `proofRef`. Hanya pemegang salt yang kelak bisa
 * mengikat commitment itu ke pseudonimnya (bukti ASSIGNMENT_OWNERSHIP).
 */
import { BadRequestException, ConflictException, Inject, Injectable } from "@nestjs/common";
import { randomBytes, randomInt } from "node:crypto";
import { bytesToHex, type Hex } from "viem";
import {
  ZkKind,
  assignmentCommitment,
  criteriaHash,
  canonicalCriteria,
  issueFieldCredential,
  proofRefOf,
  signals,
  type StorageProvider,
  type ZkProver,
} from "@decpub/shared";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { PUBLIC_STORAGE } from "../storage/storage.module.js";
import { UsersRepository, type User } from "../users/users.repository.js";
import { INVITE_CHANNEL, type InviteChannel } from "./invite-channel.js";
import { InvitationsRepository, type Invitation, type InviteRole } from "./invitations.repository.js";

export const ZK_PROVER = Symbol("ZK_PROVER");

/**
 * Kandidat penelaah kurang dari yang dibutuhkan (mis. bidang belum diverifikasi admin, atau belum cukup yang
 * mendaftarkan identitas). `ProgressService` menangkapnya sebagai langkah tertunda (`blocked`), bukan galat
 * permintaan: putusan editor sudah tercatat, dan seleksi berlanjut setelah kandidat cukup (`/system/sessions/:id/progress`).
 */
export class InsufficientCandidatesError extends ConflictException {}

/** Pengacakan yang bisa diganti di tes. */
export type Shuffle = <T>(items: readonly T[]) => T[];
export const cryptoShuffle: Shuffle = (items) => {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const SHUFFLE = Symbol("SHUFFLE");

@Injectable()
export class SelectionService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PUBLIC_STORAGE) private readonly storage: StorageProvider,
    @Inject(ZK_PROVER) private readonly prover: ZkProver,
    @Inject(INVITE_CHANNEL) private readonly channel: InviteChannel,
    @Inject(SHUFFLE) private readonly shuffle: Shuffle,
    private readonly users: UsersRepository,
    private readonly invitations: InvitationsRepository,
  ) {}

  /** Editor yang memenuhi syarat untuk kategori jurnal (belum diacak). */
  editorCandidates(categorySlug: string): User[] {
    return this.users.listByRole("editor").filter((u) => u.identityCommitment && u.verifiedFields.includes(categorySlug));
  }

  /**
   * Penelaah yang memenuhi syarat: bidang masuk kriteria, bukan penulis, dan tidak termasuk `exclude`.
   * Bila `exclude` tidak diberikan, yang sudah diundang di sesi ini (semua ronde) dikecualikan. Penggerak
   * ronde (M5) memberi `exclude` sendiri: ronde baru setelah revisi Major boleh memilih ulang orang lama.
   */
  reviewerCandidates(sessionId: string, fields: readonly string[], authorUserId: string, exclude?: ReadonlySet<string>): User[] {
    const wanted = new Set(canonicalCriteria(fields).fields);
    const already = exclude ?? new Set(this.invitations.forSession(sessionId, "reviewer").map((i) => i.userId));
    return this.users
      .listByRole("reviewer")
      .filter((u) => u.identityCommitment && u.id !== authorUserId && !already.has(u.id) && u.verifiedFields.some((f) => wanted.has(f)));
  }

  /** Mengundang satu editor acak untuk sesi. */
  async inviteEditor(sessionId: Hex, categorySlug: string): Promise<Invitation> {
    if (this.invitations.forSession(sessionId, "editor").length > 0) throw new ConflictException("Sesi ini sudah punya undangan editor");
    const pool = this.shuffle(this.editorCandidates(categorySlug));
    if (pool.length === 0) throw new ConflictException(`Tidak ada editor terdaftar untuk kategori ${categorySlug}`);
    return this.invite(pool[0], sessionId, "editor", 0, [categorySlug]);
  }

  /**
   * Memilih `count` penelaah dan menyiapkan undangannya (belum dicatat on-chain).
   *
   *  - `prefer`: pengguna yang didahulukan bila masih memenuhi syarat (revisi Minor mengundang orang
   *    yang sama, keputusan B3). Kekurangannya diisi acak dari kandidat lain.
   *  - `exclude`: pengguna yang tidak boleh dipilih (peserta ronde yang sama: zona abu-abu, pengganti no-show).
   *
   * Melempar 409 bila kandidat kurang dari `count`: seleksi tidak boleh diam-diam lebih kecil.
   */
  async inviteReviewers(
    sessionId: Hex,
    fields: readonly string[],
    count: number,
    slot: number,
    authorUserId: string,
    opts: { prefer?: readonly string[]; exclude?: ReadonlySet<string> } = {},
  ): Promise<Invitation[]> {
    const eligible = this.reviewerCandidates(sessionId, fields, authorUserId, opts.exclude);
    const byId = new Map(eligible.map((u) => [u.id, u]));
    const preferred = (opts.prefer ?? []).map((id) => byId.get(id)).filter((u): u is User => Boolean(u));
    const preferredIds = new Set(preferred.map((u) => u.id));
    const others = this.shuffle(eligible.filter((u) => !preferredIds.has(u.id)));
    const pool = [...preferred, ...others];
    if (pool.length < count) {
      throw new InsufficientCandidatesError(`Kandidat penelaah tidak cukup: butuh ${count}, tersedia ${pool.length} untuk bidang ${fields.join(", ")}`);
    }
    const out: Invitation[] = [];
    for (const u of pool.slice(0, count)) out.push(await this.invite(u, sessionId, "reviewer", slot, fields));
    return out;
  }

  private async invite(user: User, sessionId: Hex, role: InviteRole, slot: number, fields: readonly string[]): Promise<Invitation> {
    if (!user.identityCommitment) throw new BadRequestException("Kandidat belum mendaftarkan identitas");
    const criteria = canonicalCriteria(fields);
    const hash = criteriaHash(criteria.fields);
    const inviteSalt = bytesToHex(randomBytes(32)) as Hex;
    const commitment = assignmentCommitment(sessionId, inviteSalt);

    // Bukti bahwa kandidat memenuhi kriteria (witness dari server yang memilih; zk-sim memeriksanya).
    const field = criteria.fields.find((f) => user.verifiedFields.includes(f));
    if (!field) throw new BadRequestException("Kandidat tidak memenuhi kriteria bidang");
    const fieldCredential = await issueFieldCredential(this.config.issuerPrivateKey, user.identityCommitment as Hex, field);
    const proof = await this.prover.prove(
      ZkKind.Assignment,
      { identityCommitment: user.identityCommitment, field, fieldCredential, criteriaFields: criteria.fields, inviteSalt },
      signals.assignment(sessionId, hash, commitment),
    );
    const proofJson = new TextEncoder().encode(JSON.stringify(proof));
    const put = await this.storage.put(proofJson, `assignment-proof-${role}.json`);

    return this.channel.send(user.id, {
      sessionId: sessionId.toLowerCase(),
      role,
      slot,
      inviteSalt,
      assignmentCommitment: commitment,
      criteriaHash: hash,
      criteriaFields: criteria.fields,
      proofRef: proofRefOf(proofJson),
      proofUri: `ipfs://${put.cid}`,
    });
  }
}
