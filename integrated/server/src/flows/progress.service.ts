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
 * Cabang M5 (semua dibaca dari chain, tanpa state tambahan):
 *   MinorRevisionRequired / MajorRevisionRequired   menunggu penulis (`RevisionService`); sistem diam
 *   AssigningReviewers, keputusan terakhir:
 *       zona abu-abu   -> batch tambahan (+2), keputusan berikutnya diagregasi atas seluruh pseudonim ronde
 *       Minor          -> batch baru, orang yang sama dengan pseudonim baru
 *       Major / lainnya-> ronde baru (acak); editor yang sama sudah memutus ulang lewat `screeningSigned`
 *       tanpa keputusan, undangan voided -> batch pengganti (no-show)
 *   `closePhase` (admin): menutup fase Commit/Reveal yang macet karena penelaah tidak merespons.
 *
 * Batas yang masih ada: penelaah yang tidak pernah mengikat penugasan menahan sesi (jalur pengganti di M7).
 * Zona abu-abu yang masih tanpa mayoritas pada batas 10 penelaah per ronde berakhir `Rejected`.
 */
import { ConflictException, Injectable, Logger } from "@nestjs/common";
import type { Address, Hex } from "viem";
import {
  MAX_REVIEWERS_PER_SESSION,
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
import { RoundService } from "./rounds.service.js";

export interface ProgressResult {
  sessionId: Hex;
  status: string;
  /** Langkah sistem yang dikerjakan pada panggilan ini, berurutan. */
  actions: string[];
  /** Alasan sesi berhenti tanpa bisa maju sendiri dan butuh keputusan manusia; null bila tidak ada. */
  blocked: string | null;
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
    private readonly rounds: RoundService,
  ) {}

  /** Menjalankan langkah sistem untuk satu sesi; permintaan bersamaan untuk sesi yang sama berurutan. */
  advance(sessionId: Hex): Promise<ProgressResult> {
    return this.serialize(sessionId, () => this.run(sessionId, []));
  }

  private serialize<T>(sessionId: Hex, fn: () => Promise<T>): Promise<T> {
    const key = sessionId.toLowerCase();
    const prev = this.chains.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.chains.set(key, next.catch(() => undefined));
    return next;
  }

  private async run(sessionId: Hex, actions: string[]): Promise<ProgressResult> {
    const blocked: { reason: string | null } = { reason: null };
    for (let guard = 0; guard < 12; guard++) {
      const s = await this.reader.getSession(sessionId);
      let progressed = false;
      switch (s.statusValue) {
        case PublicationStatus.UnderEditorialScreening:
          progressed = await this.ensureEditorInvited(sessionId, actions);
          break;
        case PublicationStatus.AssigningReviewers:
          progressed = await this.driveReviewerSelection(sessionId, actions, blocked);
          break;
        case PublicationStatus.UnderReview:
          progressed = await this.driveReview(sessionId, actions, blocked);
          break;
        case PublicationStatus.Accepted:
          progressed = await this.publish(sessionId, actions);
          break;
        default:
          break; // termasuk Minor/MajorRevisionRequired: menunggu penulis
      }
      if (!progressed) break;
    }
    return { sessionId, status: (await this.reader.getSession(sessionId)).status, actions, blocked: blocked.reason };
  }

  /**
   * Menutup fase telaah yang macet karena penelaah tidak merespons (tenggat terlewat), lalu melanjutkan.
   * Dipanggil admin: menutup lebih awal berarti mengecualikan penelaah dari ronde ini (D3), jadi bukan
   * langkah otomatis. Tenggat otomatis menyusul bersama timeout escrow (M7).
   *
   *   Commit : ada yang commit tetapi belum semua -> buka Reveal bagi yang commit
   *   Reveal : ada yang reveal tetapi belum semua -> tutup, keputusan atas yang reveal
   *   nol commit / nol reveal -> batch ditinggalkan, sesi kembali ke AssigningReviewers dan dicarikan pengganti
   */
  closePhase(sessionId: Hex): Promise<ProgressResult> {
    return this.serialize(sessionId, async () => {
      const actions: string[] = [];
      const s = await this.reader.getSession(sessionId);
      if (s.statusValue !== PublicationStatus.UnderReview) {
        throw new ConflictException(`Tidak ada fase telaah yang bisa ditutup (status ${s.status})`);
      }
      const batch = await this.reader.latestBatchNumber(sessionId);
      if (await this.reader.decision(sessionId, batch)) throw new ConflictException(`Batch ${batch} sudah diputuskan`);
      const owners = (await this.rounds.bound(sessionId, [batch])).map((p) => p.pseudonym);
      const committed: Address[] = [];
      const revealed: Address[] = [];
      for (const p of owners) {
        if (await this.reader.hasCommit(sessionId, p)) committed.push(p);
        if (await this.reader.hasReveal(sessionId, p)) revealed.push(p);
      }
      const phase = await this.reader.reviewPhase(sessionId);

      if (phase.value === ReviewPhase.Commit) {
        if (committed.length === 0) await this.abandonBatch(sessionId, batch, "tidak ada yang commit", actions);
        else if (committed.length < owners.length) {
          await this.gateway.setReviewPhase(sessionId, ReviewPhase.Reveal);
          actions.push(`P07: fase Commit ditutup paksa, ${owners.length - committed.length} penelaah tidak commit dikecualikan, fase Reveal dibuka`);
        } else throw new ConflictException("Semua penelaah sudah commit; fase Reveal dibuka oleh sistem, tidak ada yang perlu ditutup");
      } else if (phase.value === ReviewPhase.Reveal) {
        if (revealed.length === 0) await this.abandonBatch(sessionId, batch, "tidak ada yang reveal", actions);
        else if (revealed.length < committed.length) {
          await this.gateway.setReviewPhase(sessionId, ReviewPhase.Closed);
          actions.push(`P07: fase Reveal ditutup paksa, ${committed.length - revealed.length} penelaah tidak reveal dikecualikan`);
        } else throw new ConflictException("Semua penelaah sudah reveal; sistem menutup fase sendiri");
      } else if (phase.value === ReviewPhase.Closed && revealed.length === 0) {
        await this.abandonBatch(sessionId, batch, "tidak ada yang reveal", actions);
      } else {
        throw new ConflictException(`Fase telaah ${phase.name}; tidak ada yang perlu ditutup`);
      }
      return this.run(sessionId, actions);
    });
  }

  /**
   * Batch tanpa reveal ditinggalkan: undangannya ditandai voided (orangnya tidak diundang lagi di ronde ini),
   * lalu sesi kembali ke AssigningReviewers dan `driveReviewerSelection` memilih pengganti.
   */
  private async abandonBatch(sessionId: Hex, batch: number, why: string, actions: string[]) {
    const ids = this.invitations.forBatch(sessionId, batch).map((i) => i.id);
    this.invitations.voidMany(ids);
    try {
      await this.gateway.updateStatus(sessionId, PublicationStatus.AssigningReviewers);
    } catch (e) {
      this.invitations.unvoidMany(ids);
      throw e;
    }
    actions.push(`P07: batch ${batch} ditinggalkan (${why}), kembali ke AssigningReviewers`);
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

  private async driveReviewerSelection(sessionId: Hex, actions: string[], blocked: { reason: string | null }): Promise<boolean> {
    const latest = await this.reader.latestBatchNumber(sessionId);
    const fields = (): string[] => this.fieldsFor(sessionId);

    // Belum pernah ada batch: ronde pertama (setelah putusan Proceed editor).
    if (latest === 0) {
      await this.selectBatch(sessionId, 1, REVIEWERS_PER_BATCH, fields(), {}, actions, "ronde pertama");
      return true;
    }

    const prior = await this.reader.decision(sessionId, latest);
    if (prior) {
      if (prior.grayZone) {
        // Zona abu-abu: tambah penelaah baru; keputusan berikutnya diagregasi atas seluruh pseudonim ronde.
        if (prior.additionalReviewerCount === 0) {
          // Batas penelaah per ronde (D2) tercapai dan masih tanpa mayoritas: ditolak (keputusan pengguna 2026-11-05).
          // Kontrak hanya mengizinkan AssigningReviewers -> UnderReview; Rejected dicapai dari UnderReview.
          await this.gateway.updateStatus(sessionId, PublicationStatus.UnderReview);
          await this.gateway.updateStatus(sessionId, PublicationStatus.Rejected);
          actions.push(`P07: zona abu-abu tanpa mayoritas setelah batas ${MAX_REVIEWERS_PER_SESSION} penelaah, status Rejected`);
          return true;
        }
        const batches = await this.rounds.batchesOfRound(sessionId, latest);
        const exclude = new Set(this.rounds.invitesOf(sessionId, batches, true).map((i) => i.userId));
        await this.selectBatch(sessionId, latest + 1, prior.additionalReviewerCount, fields(), { exclude }, actions, "zona abu-abu");
      } else if (prior.outcome === "MinorRevision") {
        // Revisi Minor: orang yang sama (B3), dengan pseudonim baru karena slot = nomor batch.
        const batches = await this.rounds.batchesOfRound(sessionId, latest);
        const people = (await this.rounds.revealed(sessionId, batches)).map((p) => p.invite.userId);
        await this.selectBatch(sessionId, latest + 1, Math.max(people.length, 1), fields(), { prefer: people }, actions, "revisi Minor, penelaah yang sama");
      } else {
        // Setelah revisi Major (atau revisi desk) editor memutus ulang; ronde baru, dipilih acak.
        await this.selectBatch(sessionId, latest + 1, REVIEWERS_PER_BATCH, fields(), {}, actions, "ronde baru setelah revisi Major");
      }
      return true;
    }

    const live = this.invitations.forBatch(sessionId, latest);
    if (live.length === 0) {
      // Batch ditinggalkan (tidak ada reveal): cari pengganti dengan jumlah yang sama, selain yang sudah diundang di ronde ini.
      const voided = this.invitations.forBatch(sessionId, latest, { includeVoided: true });
      if (voided.length === 0) throw new ConflictException(`Batch ${latest} tercatat di chain tetapi undangannya tidak ada di server`);
      const batches = await this.rounds.batchesOfRound(sessionId, latest);
      const exclude = new Set(this.rounds.invitesOf(sessionId, batches, true).map((i) => i.userId));
      await this.selectBatch(sessionId, latest + 1, voided.length, fields(), { exclude }, actions, "pengganti batch yang ditinggalkan");
      return true;
    }

    // Batch sudah tercatat dan belum diputuskan: pastikan bukti tercatat, lalu tunggu semua penelaah menerima.
    await this.ensureProofsRecorded(sessionId, live, actions);
    for (const i of live) {
      if (!(await this.reader.assignmentOwner(sessionId, i.assignmentCommitment as Hex))) return false;
    }
    await this.gateway.updateStatus(sessionId, PublicationStatus.UnderReview);
    await this.gateway.setReviewPhase(sessionId, ReviewPhase.Commit);
    actions.push(`P06: semua ${live.length} penelaah batch ${latest} menerima, status UnderReview, fase Commit`);
    return true;
  }

  /** Bidang penelaah: kriteria editor terakhir, atau kategori jurnal bila editor tidak mengisi. */
  private fieldsFor(sessionId: Hex): string[] {
    const criteria = this.invitations.latestCriteria(sessionId);
    if (criteria) return criteria.fields;
    const m = this.manuscripts.bySession(sessionId);
    if (!m) throw new ConflictException("Naskah untuk sesi ini tidak ada di server");
    const journal = this.journals.get(m.journalId);
    if (!journal) throw new ConflictException("Jurnal naskah tidak ditemukan");
    return [journal.categorySlug];
  }

  private async selectBatch(
    sessionId: Hex,
    slot: number,
    count: number,
    fields: string[],
    opts: { prefer?: readonly string[]; exclude?: ReadonlySet<string> },
    actions: string[],
    why: string,
  ) {
    const m = this.manuscripts.bySession(sessionId);
    if (!m) throw new ConflictException("Naskah untuk sesi ini tidak ada di server");

    const invites = await this.selection.inviteReviewers(sessionId, fields, count, slot, m.ownerUserId, { prefer: opts.prefer, exclude: opts.exclude ?? new Set() });
    try {
      const commitments = invites.map((i) => i.assignmentCommitment as Hex);
      await this.gateway.recordSelectionBatch(sessionId, criteriaHash(fields), count, commitments);
    } catch (e) {
      this.invitations.deleteMany(invites.map((i) => i.id)); // batch tidak tercatat: batalkan undangan
      throw e;
    }
    actions.push(`P06: batch ${slot} tercatat, ${count} penelaah diundang (${why})`);
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

  private async driveReview(sessionId: Hex, actions: string[], blocked: { reason: string | null }): Promise<boolean> {
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
      // Hanya yang commit yang bisa reveal; yang tidak commit sudah dikecualikan lewat `closePhase`.
      for (const p of owners) if ((await this.reader.hasCommit(sessionId, p)) && !(await this.reader.hasReveal(sessionId, p))) return false;
      await this.gateway.setReviewPhase(sessionId, ReviewPhase.Closed);
      actions.push("P07: semua reveal masuk, fase Closed");
      return true;
    }

    // Closed: tinggal keputusan.
    if (await this.reader.decision(sessionId, batch)) return false;
    return this.decide(sessionId, batch, actions, blocked);
  }

  /**
   * Keputusan atas seluruh pseudonim ronde yang reveal (D3). Pada zona abu-abu kedua dan seterusnya
   * ronde mencakup batch-batch sebelumnya, sehingga agregasi diulang atas semua pseudonim.
   * Tambahan penelaah dibatasi supaya ronde tidak melebihi `MAX_REVIEWERS_PER_SESSION`.
   */
  private async decide(sessionId: Hex, batch: number, actions: string[], blocked: { reason: string | null }): Promise<boolean> {
    const batches = await this.rounds.batchesOfRound(sessionId, batch);
    const revealed = await this.rounds.revealed(sessionId, batches);
    if (revealed.length === 0) {
      blocked.reason = "Tidak ada penelaah yang reveal; tutup fase (admin) agar batch ditinggalkan dan dicarikan pengganti";
      return false;
    }
    const rowCount = this.rounds.invitesOf(sessionId, batches).length;
    const additional = Math.max(0, Math.min(REVIEWERS_ADDED_ON_GRAY_ZONE, MAX_REVIEWERS_PER_SESSION - rowCount));
    await this.gateway.decideBatch(sessionId, batch, revealed.map((p) => p.pseudonym), additional);
    const d = await this.reader.decision(sessionId, batch);
    const agg = batches.length > 1 ? `, diagregasi atas ${revealed.length} pseudonim dari batch ${batches.join("+")}` : "";
    actions.push(`P07: keputusan batch ${batch} = ${d?.grayZone ? "zona abu-abu" : d?.outcome}${agg}`);
    return true;
  }

  // ---------------------------------------------------------------- P08

  private async publish(sessionId: Hex, actions: string[]): Promise<boolean> {
    await this.gateway.updateStatus(sessionId, PublicationStatus.Published);
    actions.push("P08: status Published");
    return true;
  }
}
