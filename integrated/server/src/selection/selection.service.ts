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

  /** Penelaah yang memenuhi syarat: bidang masuk kriteria, bukan penulis, belum diundang di sesi ini. */
  reviewerCandidates(sessionId: string, fields: readonly string[], authorUserId: string): User[] {
    const wanted = new Set(canonicalCriteria(fields).fields);
    const already = new Set(this.invitations.forSession(sessionId, "reviewer").map((i) => i.userId));
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
   * Memilih `count` penelaah acak dan menyiapkan undangannya (belum dicatat on-chain).
   * Melempar 409 bila kandidat kurang dari `count`: seleksi tidak boleh diam-diam lebih kecil.
   */
  async inviteReviewers(sessionId: Hex, fields: readonly string[], count: number, slot: number, authorUserId: string): Promise<Invitation[]> {
    const pool = this.shuffle(this.reviewerCandidates(sessionId, fields, authorUserId));
    if (pool.length < count) {
      throw new ConflictException(`Kandidat penelaah tidak cukup: butuh ${count}, tersedia ${pool.length} untuk bidang ${fields.join(", ")}`);
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
