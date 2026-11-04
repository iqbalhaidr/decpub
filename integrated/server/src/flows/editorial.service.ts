/**
 * P05 - Penyaringan editorial.
 *
 *  acceptEditor : editor yang diundang membuktikan kepemilikan undangan (ASSIGNMENT_OWNERSHIP)
 *                 untuk pseudonim Editor-nya; sistem menugaskannya (`assignEditor`) dan mencatat
 *                 bukti penugasan. Server tidak menyimpan pseudonimnya (hanya chain).
 *  screen       : putusan bertanda tangan pseudonim Editor. Hash laporan diperiksa terhadap isi
 *                 laporan yang dikirim, laporan anonim diunggah ke storage publik, lalu aksi
 *                 diteruskan ke gateway. Putusan Proceed mencatat kriteria penelaah dan memicu P06.
 */
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { keccak256, type Address, type Hex } from "viem";
import {
  DeskDecision,
  PublicationStatus,
  REVIEWERS_PER_BATCH,
  ZkKind,
  canonicalCriteria,
  criteriaHash,
  editorialReportDocuments,
  isFieldSlug,
  signals,
  type ScreeningAction,
  type StorageProvider,
} from "@decpub/shared";
import type { TxReceipt } from "../chain/chain.service.js";
import { GatewayService } from "../chain/gateway.service.js";
import { SessionReader } from "../chain/session-reader.service.js";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { PRIVATE_STORE, type PrivateStore } from "../storage/private-store.js";
import { PUBLIC_STORAGE } from "../storage/storage.module.js";
import { InvitationsRepository } from "../selection/invitations.repository.js";
import { AssignmentOwnershipDto, ScreeningDto } from "./assignments.dto.js";
import { ProgressService, type ProgressResult } from "./progress.service.js";

const ZERO_ADDR = /^0x0{40}$/i;

@Injectable()
export class EditorialService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PUBLIC_STORAGE) private readonly storage: StorageProvider,
    @Inject(PRIVATE_STORE) private readonly privateStore: PrivateStore,
    private readonly gateway: GatewayService,
    private readonly reader: SessionReader,
    private readonly invitations: InvitationsRepository,
    private readonly progress: ProgressService,
  ) {}

  async acceptEditor(dto: AssignmentOwnershipDto): Promise<{ txs: TxReceipt[]; progress?: ProgressResult }> {
    const sessionId = dto.sessionId as Hex;
    const pseudonym = dto.pseudonym as Address;
    const invite = this.invitations.byCommitment(sessionId, dto.assignmentCommitment);
    if (!invite || invite.role !== "editor") throw new NotFoundException("Undangan editor tidak ditemukan");
    if (invite.acceptedAt) throw new ConflictException("Undangan editor ini sudah diterima");

    const session = await this.reader.getSession(sessionId);
    if (session.statusValue !== PublicationStatus.UnderEditorialScreening) {
      throw new ConflictException(`Sesi tidak sedang di penyaringan editorial (status ${session.status})`);
    }
    if (!ZERO_ADDR.test(session.editorPseudonym)) throw new ConflictException("Sesi ini sudah punya editor");

    const eph = await this.reader.ephemeral(pseudonym);
    if (!eph.exists || eph.revoked || eph.role !== "Editor" || eph.sessionId.toLowerCase() !== sessionId.toLowerCase()) {
      throw new BadRequestException("Pseudonim bukan Editor untuk sesi ini (buat dulu lewat POST /flows/ephemeral-account)");
    }
    const ok = await this.reader.verifyProof(
      ZkKind.AssignmentOwnership,
      signals.assignmentOwnership(sessionId, dto.assignmentCommitment as Hex, pseudonym),
      dto.proof as Hex,
    );
    if (!ok) throw new BadRequestException("Bukti kepemilikan undangan tidak sah");

    const txs = [
      await this.gateway.assignEditor(sessionId, pseudonym),
      await this.gateway.recordEditorAssignmentProof(sessionId, pseudonym, invite.proofRef as Hex),
    ];
    this.invitations.markAccepted(invite.id);
    return { txs, progress: this.config.autoAdvance ? await this.progress.advance(sessionId) : undefined };
  }

  async screen(dto: ScreeningDto): Promise<{ tx: TxReceipt; reportUrl: string; criteria?: { fields: string[]; hash: Hex }; progress?: ProgressResult }> {
    const a = dto.action;
    const sessionId = a.sessionId as Hex;
    const session = await this.reader.getSession(sessionId);
    if (session.statusValue !== PublicationStatus.UnderEditorialScreening) {
      throw new ConflictException(`Sesi tidak sedang di penyaringan editorial (status ${session.status})`);
    }
    if (session.editorPseudonym.toLowerCase() !== a.pseudonym.toLowerCase()) {
      throw new ConflictException("Pseudonim bukan editor sesi ini");
    }
    if (dto.report.decision !== a.decision) throw new BadRequestException("decision pada aksi dan laporan berbeda");

    const proceed = a.decision === DeskDecision.ProceedToReviewerSelection;
    const fields = canonicalCriteria(dto.report.reviewerFields).fields;
    if (proceed) {
      if (fields.length === 0) throw new BadRequestException("Putusan Proceed butuh minimal satu bidang penelaah");
      const bad = fields.find((f) => !isFieldSlug(f));
      if (bad) throw new BadRequestException(`Bidang tidak dikenal: ${bad}`);
    }

    const { publicBytes, fullBytes } = editorialReportDocuments({
      sessionId,
      revision: session.revisionCount,
      decision: a.decision,
      comments: dto.report.comments,
      reviewerFields: dto.report.reviewerFields,
      privateNotes: dto.report.privateNotes,
    });
    if (keccak256(fullBytes).toLowerCase() !== a.editorialReportHash.toLowerCase()) {
      throw new BadRequestException("editorialReportHash tidak sama dengan laporan lengkap yang dikirim");
    }
    if (keccak256(publicBytes).toLowerCase() !== a.anonymousEditorialReportHash.toLowerCase()) {
      throw new BadRequestException("anonymousEditorialReportHash tidak sama dengan laporan publik yang dikirim");
    }
    const cid = await this.storage.cidOf(publicBytes);
    if (a.anonymousEditorialReportURI !== `ipfs://${cid}`) {
      throw new BadRequestException(`anonymousEditorialReportURI harus ipfs://${cid}`);
    }

    // Laporan lengkap (dengan catatan internal) hanya di storage privat; yang publik diunggah sebelum dicatat.
    await this.privateStore.put(`editorial/${sessionId.toLowerCase()}/${session.revisionCount}.json`, fullBytes);
    await this.storage.put(publicBytes, "editorial-report.json");

    const tx = await this.gateway.screeningSigned({ ...a, sessionId, pseudonym: a.pseudonym as Address, editorialReportHash: a.editorialReportHash as Hex, anonymousEditorialReportHash: a.anonymousEditorialReportHash as Hex, nonce: BigInt(a.nonce) } satisfies ScreeningAction, dto.signature as Hex);

    let criteria: { fields: string[]; hash: Hex } | undefined;
    if (proceed) {
      criteria = { fields, hash: criteriaHash(fields) };
      this.invitations.saveCriteria({ sessionId, revision: session.revisionCount, fields, criteriaHash: criteria.hash });
      await this.gateway.recordReviewerCriteria(sessionId, criteria.hash, REVIEWERS_PER_BATCH);
    }
    const reportUrl = `${this.config.storage.gatewayUrl}/ipfs/${cid}`;
    return { tx, reportUrl, criteria, progress: this.config.autoAdvance ? await this.progress.advance(sessionId) : undefined };
  }
}
