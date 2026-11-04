/**
 * P06-P07 sisi penelaah: pengikatan penugasan, commit, dan reveal.
 *
 *  bind   : pemegang undangan mengikat commitment penugasan ke pseudonim Reviewer-nya
 *           (bukti ASSIGNMENT_OWNERSHIP). Tanpa ini gateway menolak commit.
 *  commit : aksi bertanda tangan pseudonim. Server hanya menerima `commitHash` yang dihitung
 *           KLIEN; rekomendasi dan nonce tidak pernah ada di permintaan ini.
 *  reveal : baru diterima setelah fase Reveal (dibuka sistem setelah semua commit). Server
 *           memeriksa pembukaan cocok dengan commit dan isi telaah cocok dengan hash/CID yang
 *           di-commit SEBELUM mengunggah apa pun, lalu meneruskan ke gateway.
 */
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { keccak256, type Address, type Hex } from "viem";
import {
  PublicationStatus,
  ReviewPhase,
  computeCommitHash,
  reviewDocument,
  type CommitAction,
  type RecommendationValue,
  type RevealAction,
  type StorageProvider,
} from "@decpub/shared";
import type { TxReceipt } from "../chain/chain.service.js";
import { GatewayService } from "../chain/gateway.service.js";
import { SessionReader } from "../chain/session-reader.service.js";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { InvitationsRepository } from "../selection/invitations.repository.js";
import { PUBLIC_STORAGE } from "../storage/storage.module.js";
import { AssignmentOwnershipDto, CommitDto, RevealDto } from "./assignments.dto.js";
import { ProgressService, type ProgressResult } from "./progress.service.js";

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PUBLIC_STORAGE) private readonly storage: StorageProvider,
    private readonly gateway: GatewayService,
    private readonly reader: SessionReader,
    private readonly invitations: InvitationsRepository,
    private readonly progress: ProgressService,
  ) {}

  private async next(sessionId: Hex): Promise<ProgressResult | undefined> {
    return this.config.autoAdvance ? this.progress.advance(sessionId) : undefined;
  }

  async bind(dto: AssignmentOwnershipDto): Promise<{ tx: TxReceipt; progress?: ProgressResult }> {
    const sessionId = dto.sessionId as Hex;
    const invite = this.invitations.byCommitment(sessionId, dto.assignmentCommitment);
    if (!invite || invite.role !== "reviewer") throw new NotFoundException("Undangan penelaah tidak ditemukan");
    // Pengecekan bukti, peran, sesi, dan keunikan dilakukan gateway on-chain (AssignmentBound).
    const tx = await this.gateway.bindAssignment(sessionId, dto.assignmentCommitment as Hex, dto.pseudonym as Address, dto.proof as Hex);
    this.invitations.markAccepted(invite.id);
    return { tx, progress: await this.next(sessionId) };
  }

  async commit(dto: CommitDto): Promise<{ tx: TxReceipt; progress?: ProgressResult }> {
    const a = dto.action;
    const sessionId = a.sessionId as Hex;
    const session = await this.reader.getSession(sessionId);
    if (session.statusValue !== PublicationStatus.UnderReview) throw new ConflictException(`Sesi tidak sedang ditelaah (status ${session.status})`);
    const phase = await this.reader.reviewPhase(sessionId);
    if (phase.value !== ReviewPhase.Commit) throw new ConflictException(`Fase telaah ${phase.name}; commit hanya diterima pada fase Commit`);

    const action: CommitAction = {
      sessionId,
      pseudonym: a.pseudonym as Address,
      assignmentCommitment: a.assignmentCommitment as Hex,
      commitHash: a.commitHash as Hex,
      nonce: BigInt(a.nonce),
    };
    const tx = await this.gateway.commitReviewSigned(action, dto.signature as Hex);
    return { tx, progress: await this.next(sessionId) };
  }

  async reveal(dto: RevealDto): Promise<{ tx: TxReceipt; reviewUrl: string; progress?: ProgressResult }> {
    const a = dto.action;
    const sessionId = a.sessionId as Hex;
    const pseudonym = a.pseudonym as Address;
    const session = await this.reader.getSession(sessionId);
    if (session.statusValue !== PublicationStatus.UnderReview) throw new ConflictException(`Sesi tidak sedang ditelaah (status ${session.status})`);
    const phase = await this.reader.reviewPhase(sessionId);
    if (phase.value !== ReviewPhase.Reveal) {
      throw new ConflictException(`Fase telaah ${phase.name}; reveal hanya diterima setelah semua penelaah commit (fase Reveal)`);
    }

    // 1. Pembukaan harus cocok dengan commit yang tercatat.
    const commit = await this.reader.commitRecord(sessionId, pseudonym);
    if (!commit) throw new ConflictException("Pseudonim ini belum commit");
    if (commit.revealed) throw new ConflictException("Pseudonim ini sudah reveal");
    const expected = computeCommitHash({
      sessionId,
      pseudonym,
      recommendation: a.recommendation as RecommendationValue,
      reviewHash: a.reviewHash as Hex,
      reviewURI: a.reviewURI,
      nonce: a.reviewNonce as Hex,
    });
    if (expected.toLowerCase() !== commit.commitHash.toLowerCase()) {
      throw new BadRequestException("Pembukaan tidak cocok dengan commit (rekomendasi, hash, URI, atau nonce berbeda)");
    }

    // 2. Isi telaah harus cocok dengan hash dan CID yang di-commit; baru kemudian diunggah.
    const bytes = reviewDocument(sessionId, dto.text);
    if (keccak256(bytes).toLowerCase() !== a.reviewHash.toLowerCase()) throw new BadRequestException("Isi telaah tidak sama dengan reviewHash yang di-commit");
    const cid = await this.storage.cidOf(bytes);
    if (a.reviewURI !== `ipfs://${cid}`) throw new BadRequestException(`reviewURI harus ipfs://${cid}`);
    await this.storage.put(bytes, "peer-review.json");

    const action: RevealAction = {
      sessionId,
      pseudonym,
      assignmentCommitment: a.assignmentCommitment as Hex,
      recommendation: a.recommendation,
      reviewHash: a.reviewHash as Hex,
      reviewURI: a.reviewURI,
      reviewNonce: a.reviewNonce as Hex,
      nonce: BigInt(a.nonce),
    };
    const tx = await this.gateway.revealReviewSigned(action, dto.signature as Hex);
    return { tx, reviewUrl: `${this.config.storage.gatewayUrl}/ipfs/${cid}`, progress: await this.next(sessionId) };
  }
}
