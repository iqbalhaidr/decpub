/**
 * Penggerak langkah SISTEM untuk P05-P08. Setiap panggilan membaca keadaan chain (sumber
 * kebenaran) lalu mengerjakan kewajiban sistem berikutnya sampai menunggu aksi manusia.
 * Idempoten: aman dipanggil ulang, setelah crash, atau oleh banyak permintaan bersamaan
 * (diserialkan per sesi).
 *
 *   UnderEditorialScreening  belum ada editor    -> undang satu editor acak (menunggu penerimaan)
 *   AssigningReviewers       belum ada batch     -> pilih penelaah, catat batch dan bukti (menunggu pengikatan)
 *                            semua terikat       -> status UnderReview, fase Commit
 *   UnderReview / Commit     semua sudah commit  -> fase Reveal
 *   UnderReview / Reveal     semua sudah reveal  -> fase Closed, decideBatch
 *   Accepted                                     -> Published
 *
 * Yang belum ditangani (M5): hasil Minor/Major/Reject setelah `decideBatch`, zona abu-abu,
 * penelaah yang tidak commit atau reveal. Sesi dalam keadaan itu berhenti sampai M5.
 */
import { ConflictException, Injectable, Logger } from "@nestjs/common";
import type { Address, Hex } from "viem";
import {
  PublicationStatus,
  REVIEWERS_ADDED_ON_GRAY_ZONE,
  REVIEWERS_PER_BATCH,
  ReviewPhase,
  criteriaHash,
  inviteRef,
} from "@decpub/shared";
import { GatewayService } from "../chain/gateway.service.js";
import { SessionReader } from "../chain/session-reader.service.js";
import { JournalsRepository } from "../journals/journals.repository.js";
import { ManuscriptsRepository } from "../manuscripts/manuscripts.repository.js";
import { InvitationsRepository, type Invitation } from "../selection/invitations.repository.js";
import { SelectionService } from "../selection/selection.service.js";

export interface ProgressResult {
  sessionId: Hex;
  status: string;
  /** Langkah sistem yang dikerjakan pada panggilan ini, berurutan. */
  actions: string[];
}

@Injectable()
export class ProgressService {
  private readonly log = new Logger(ProgressService.name);
  private readonly chains = new Map<string, Promise<unknown>>();

  constructor(
    private readonly gateway: GatewayService,
    private readonly reader: SessionReader,
    private readonly selection: SelectionService,
    private readonly invitations: InvitationsRepository,
    private readonly manuscripts: ManuscriptsRepository,
    private readonly journals: JournalsRepository,
  ) {}

  /** Menjalankan langkah sistem untuk satu sesi; permintaan bersamaan untuk sesi yang sama berurutan. */
  advance(sessionId: Hex): Promise<ProgressResult> {
    const key = sessionId.toLowerCase();
    const prev = this.chains.get(key) ?? Promise.resolve();
    const next = prev.then(
      () => this.run(sessionId),
      () => this.run(sessionId),
    );
    this.chains.set(key, next.catch(() => undefined));
    return next;
  }

  private async run(sessionId: Hex): Promise<ProgressResult> {
    const actions: string[] = [];
    for (let guard = 0; guard < 12; guard++) {
      const s = await this.reader.getSession(sessionId);
      let progressed = false;
      switch (s.statusValue) {
        case PublicationStatus.UnderEditorialScreening:
          progressed = await this.ensureEditorInvited(sessionId, actions);
          break;
        case PublicationStatus.AssigningReviewers:
          progressed = await this.driveReviewerSelection(sessionId, actions);
          break;
        case PublicationStatus.UnderReview:
          progressed = await this.driveReview(sessionId, actions);
          break;
        case PublicationStatus.Accepted:
          progressed = await this.publish(sessionId, actions);
          break;
        default:
          break;
      }
      if (!progressed) break;
    }
    return { sessionId, status: (await this.reader.getSession(sessionId)).status, actions };
  }

  // ---------------------------------------------------------------- P05

  private async ensureEditorInvited(sessionId: Hex, actions: string[]): Promise<boolean> {
    const s = await this.reader.getSession(sessionId);
    if (!/^0x0{40}$/i.test(s.editorPseudonym)) return false; // editor sudah ditugaskan
    if (this.invitations.forSession(sessionId, "editor").length > 0) return false; // undangan menunggu
    const m = this.manuscripts.bySession(sessionId);
    if (!m) throw new ConflictException("Naskah untuk sesi ini tidak ada di server");
    const journal = this.journals.get(m.journalId);
    if (!journal) throw new ConflictException("Jurnal naskah tidak ditemukan");
    await this.selection.inviteEditor(sessionId, journal.categorySlug);
    actions.push("P05: editor diundang");
    return false; // sekarang menunggu penerimaan editor
  }

  // ---------------------------------------------------------------- P06

  private async driveReviewerSelection(sessionId: Hex, actions: string[]): Promise<boolean> {
    const latest = await this.reader.latestBatchNumber(sessionId);
    const prior = latest > 0 ? await this.reader.decision(sessionId, latest) : null;

    if (latest === 0 || prior) {
      await this.selectBatch(sessionId, latest + 1, prior, actions);
      return true;
    }

    // Batch sudah tercatat dan belum diputuskan: pastikan bukti tercatat, lalu tunggu semua penelaah menerima.
    const invites = this.invitations.forBatch(sessionId, latest);
    if (invites.length === 0) throw new ConflictException(`Batch ${latest} tercatat di chain tetapi undangannya tidak ada di server`);
    await this.ensureProofsRecorded(sessionId, invites, actions);
    for (const i of invites) {
      if (!(await this.reader.assignmentOwner(sessionId, i.assignmentCommitment as Hex))) return false;
    }
    await this.gateway.updateStatus(sessionId, PublicationStatus.UnderReview);
    await this.gateway.setReviewPhase(sessionId, ReviewPhase.Commit);
    actions.push(`P06: semua ${invites.length} penelaah batch ${latest} menerima, status UnderReview, fase Commit`);
    return true;
  }

  private async selectBatch(sessionId: Hex, slot: number, prior: { grayZone: boolean; additionalReviewerCount: number } | null, actions: string[]) {
    const m = this.manuscripts.bySession(sessionId);
    if (!m) throw new ConflictException("Naskah untuk sesi ini tidak ada di server");
    const journal = this.journals.get(m.journalId)!;
    const criteria = this.invitations.latestCriteria(sessionId);
    const fields = criteria?.fields ?? [journal.categorySlug];
    const count = prior?.grayZone && prior.additionalReviewerCount > 0 ? prior.additionalReviewerCount : REVIEWERS_PER_BATCH;

    const invites = await this.selection.inviteReviewers(sessionId, fields, count, slot, m.ownerUserId);
    try {
      const commitments = invites.map((i) => i.assignmentCommitment as Hex);
      await this.gateway.recordSelectionBatch(sessionId, criteriaHash(fields), count, commitments);
    } catch (e) {
      this.invitations.deleteMany(invites.map((i) => i.id)); // batch tidak tercatat: batalkan undangan
      throw e;
    }
    actions.push(`P06: batch ${slot} tercatat, ${count} penelaah diundang`);
    await this.ensureProofsRecorded(sessionId, invites, actions);
  }

  private async ensureProofsRecorded(sessionId: Hex, invites: Invitation[], actions: string[]) {
    // Bukti penugasan dicatat sekali per commitment; coba lagi hanya untuk yang belum ada.
    const missing: Invitation[] = [];
    for (const i of invites) {
      const has = await this.reader.hasReviewerProof(sessionId, i.assignmentCommitment as Hex);
      if (!has) missing.push(i);
    }
    if (missing.length === 0) return;
    await this.gateway.batchRecordReviewerAssignmentProofs(
      sessionId,
      missing.map((i) => i.assignmentCommitment as Hex),
      missing.map((i) => inviteRef(sessionId, i.assignmentCommitment as Hex, i.proofRef as Hex)),
      missing.map((i) => i.proofRef as Hex),
    );
    actions.push(`P06: ${missing.length} bukti penugasan penelaah tercatat`);
  }

  // ---------------------------------------------------------------- P07

  private async driveReview(sessionId: Hex, actions: string[]): Promise<boolean> {
    const batch = await this.reader.latestBatchNumber(sessionId);
    const invites = this.invitations.forBatch(sessionId, batch);
    if (invites.length === 0) throw new ConflictException(`Batch ${batch} tidak punya undangan di server`);

    const owners: Address[] = [];
    for (const i of invites) {
      const o = await this.reader.assignmentOwner(sessionId, i.assignmentCommitment as Hex);
      if (!o) return false; // penelaah belum mengikat penugasan
      owners.push(o);
    }

    const phase = await this.reader.reviewPhase(sessionId);
    if (phase.value === ReviewPhase.None) {
      await this.gateway.setReviewPhase(sessionId, ReviewPhase.Commit);
      actions.push("P07: fase Commit dibuka");
      return true;
    }

    if (phase.value === ReviewPhase.Commit) {
      for (const p of owners) if (!(await this.reader.hasCommit(sessionId, p))) return false;
      // Reveal baru dibuka setelah SEMUA commit: kontrak tidak menegakkannya (ReviewSubmissions.sol:52-71).
      await this.gateway.setReviewPhase(sessionId, ReviewPhase.Reveal);
      actions.push("P07: semua commit masuk, fase Reveal dibuka");
      return true;
    }

    if (phase.value === ReviewPhase.Reveal) {
      for (const p of owners) if (!(await this.reader.hasReveal(sessionId, p))) return false;
      await this.gateway.setReviewPhase(sessionId, ReviewPhase.Closed);
      actions.push("P07: semua reveal masuk, fase Closed");
      return true;
    }

    // Closed: tinggal keputusan. Hanya pseudonim yang sudah reveal yang dihitung (keputusan D3).
    if (await this.reader.decision(sessionId, batch)) return false;
    const revealed: Address[] = [];
    for (const p of owners) if (await this.reader.hasReveal(sessionId, p)) revealed.push(p);
    await this.gateway.decideBatch(sessionId, batch, revealed, REVIEWERS_ADDED_ON_GRAY_ZONE);
    const d = await this.reader.decision(sessionId, batch);
    actions.push(`P07: keputusan batch ${batch} = ${d?.grayZone ? "zona abu-abu" : d?.outcome}`);
    return true;
  }

  // ---------------------------------------------------------------- P08

  private async publish(sessionId: Hex, actions: string[]): Promise<boolean> {
    await this.gateway.updateStatus(sessionId, PublicationStatus.Published);
    actions.push("P08: status Published");
    return true;
  }
}
