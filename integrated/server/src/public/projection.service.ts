/**
 * Proyeksi publik sebuah sesi, dibatasi menurut status/fase:
 *  - naskah anonim, hasil P03, putusan editorial, dan jumlah penelaah selalu tampil;
 *  - isi dan rekomendasi telaah baru tampil setelah fase telaah Closed (semua reveal masuk),
 *    sehingga halaman publik tidak menampilkan telaah sebagian selagi penelaah lain belum membuka;
 *  - tidak pernah ada nama, surel, afiliasi, naskah asli, atau pemetaan akun-pseudonim.
 * (Event on-chain tetap publik di ledger; pembatasan ini untuk proyeksi API.)
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Address, Hex } from "viem";
import { PublicationStatus, ReviewPhase, gatewayUrl } from "@decpub/shared";
import { SessionReader } from "../chain/session-reader.service.js";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { InvitationsRepository } from "../selection/invitations.repository.js";

const cidOfUri = (uri: string) => uri.replace(/^ipfs:\/\//, "");

@Injectable()
export class ProjectionService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly reader: SessionReader,
    private readonly invitations: InvitationsRepository,
  ) {}

  private url(uri: string) {
    return gatewayUrl(this.config.storage, cidOfUri(uri));
  }

  async session(sessionId: Hex) {
    const session = await this.reader.getSession(sessionId);
    const automaticCheck = await this.reader.latestCheck(sessionId);
    const editorial = await this.reader.editorialRecord(sessionId, session.revisionCount);

    const batchNo = await this.reader.latestBatchNumber(sessionId);
    const phase = await this.reader.reviewPhase(sessionId);
    const invites = batchNo > 0 ? this.invitations.forBatch(sessionId, batchNo) : [];
    const owners: Address[] = [];
    for (const i of invites) {
      const o = await this.reader.assignmentOwner(sessionId, i.assignmentCommitment as Hex);
      if (o) owners.push(o);
    }
    let committed = 0;
    let revealed = 0;
    const reveals = [];
    for (const p of owners) {
      if (await this.reader.hasCommit(sessionId, p)) committed++;
      const r = await this.reader.revealRecord(sessionId, p);
      if (r) {
        revealed++;
        reveals.push(r);
      }
    }
    const decision = batchNo > 0 ? await this.reader.decision(sessionId, batchNo) : null;
    const reviewsVisible = phase.value === ReviewPhase.Closed || session.statusValue >= PublicationStatus.Accepted;

    return {
      session,
      anonymizedManuscriptUrl: this.url(session.anonymizedManuscriptURI),
      automaticCheck,
      reportUrl: automaticCheck ? this.url(automaticCheck.reportURI) : null,
      editorial: editorial && { ...editorial, reportUrl: this.url(editorial.anonymousEditorialReportURI) },
      selection: { batch: batchNo, selected: invites.length, bound: owners.length },
      review: {
        phase: phase.name,
        committed,
        revealed,
        // Pseudonim penelaah tampil bersama rekomendasinya (matriks insentif publik); tanpa identitas orang.
        reviews: reviewsVisible
          ? reveals.map((r) => ({ pseudonym: r.reviewerPseudonym, recommendation: r.recommendation, reviewUrl: this.url(r.reviewURI), revealedAt: r.revealedAt }))
          : null,
      },
      decision,
    };
  }

  /** Bukti penugasan: commitment, referensi on-chain, dan tempat berkas bukti (tanpa identitas penerima). */
  assignmentProofs(sessionId: Hex) {
    return this.invitations.forSession(sessionId).map((i) => ({
      role: i.role,
      slot: i.slot,
      assignmentCommitment: i.assignmentCommitment,
      criteria: { fields: i.criteriaFields, hash: i.criteriaHash },
      proofRef: i.proofRef,
      proofUrl: this.url(i.proofUri),
    }));
  }
}
