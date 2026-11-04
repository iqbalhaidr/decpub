/**
 * Proyeksi publik sebuah sesi, dibatasi menurut status/fase:
 *  - naskah anonim, hasil P03, putusan editorial, dan jumlah penelaah selalu tampil;
 *  - isi dan rekomendasi telaah baru tampil setelah fase telaah Closed (semua reveal masuk),
 *    sehingga halaman publik tidak menampilkan telaah sebagian selagi penelaah lain belum membuka;
 *  - tidak pernah ada nama, surel, afiliasi, naskah asli, atau pemetaan akun-pseudonim.
 * (Event on-chain tetap publik di ledger; pembatasan ini untuk proyeksi API.)
 */
import { Inject, Injectable } from "@nestjs/common";
import type { Hex } from "viem";
import { PublicationStatus, ReviewPhase, gatewayUrl } from "@decpub/shared";
import { SessionReader } from "../chain/session-reader.service.js";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { InvitationsRepository } from "../selection/invitations.repository.js";
import { RoundService } from "../flows/rounds.service.js";
import { RecordsService } from "../publication/records.service.js";

const cidOfUri = (uri: string) => uri.replace(/^ipfs:\/\//, "");

@Injectable()
export class ProjectionService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly reader: SessionReader,
    private readonly invitations: InvitationsRepository,
    private readonly rounds: RoundService,
    private readonly records: RecordsService,
  ) {}

  private url(uri: string) {
    return gatewayUrl(this.config.storage, cidOfUri(uri));
  }

  async session(sessionId: Hex) {
    const session = await this.reader.getSession(sessionId);
    const automaticCheck = await this.reader.latestCheck(sessionId);
    // Revisi Minor kembali ke pemilihan penelaah tanpa penyaringan baru (B3), jadi catatan editorial terbaru bisa ada di revisi lebih lama.
    let editorial = null;
    for (let rev = session.revisionCount; rev >= 0 && !editorial; rev--) editorial = await this.reader.editorialRecord(sessionId, rev);

    const batchNo = await this.reader.latestBatchNumber(sessionId);
    const phase = await this.reader.reviewPhase(sessionId);
    // `selection` menggambarkan batch terakhir; `review` mencakup seluruh ronde (zona abu-abu menambah batch).
    const latestInvites = batchNo > 0 ? this.invitations.forBatch(sessionId, batchNo) : [];
    let boundInLatest = 0;
    for (const i of latestInvites) if (await this.reader.assignmentOwner(sessionId, i.assignmentCommitment as Hex)) boundInLatest++;
    const roundBatches = batchNo > 0 ? await this.rounds.batchesOfRound(sessionId, batchNo) : [];
    const participants = await this.rounds.bound(sessionId, roundBatches);
    let committed = 0;
    let revealed = 0;
    const reveals = [];
    for (const { pseudonym } of participants) {
      if (await this.reader.hasCommit(sessionId, pseudonym)) committed++;
      const r = await this.reader.revealRecord(sessionId, pseudonym);
      if (r) {
        revealed++;
        reveals.push(r);
      }
    }
    // Keputusan setiap batch, berurutan: jejak zona abu-abu dan revisi terlihat tanpa membaca event satu per satu.
    const decisions = [];
    for (let b = 1; b <= batchNo; b++) {
      const d = await this.reader.decision(sessionId, b);
      if (d) decisions.push(d);
    }
    const decision = batchNo > 0 ? await this.reader.decision(sessionId, batchNo) : null;
    const reviewsVisible = phase.value === ReviewPhase.Closed || session.statusValue >= PublicationStatus.Accepted;

    return {
      session,
      anonymizedManuscriptUrl: this.url(session.anonymizedManuscriptURI),
      automaticCheck,
      reportUrl: automaticCheck ? this.url(automaticCheck.reportURI) : null,
      editorial: editorial && { ...editorial, reportUrl: this.url(editorial.anonymousEditorialReportURI) },
      selection: { batch: batchNo, selected: latestInvites.length, bound: boundInLatest },
      review: {
        phase: phase.name,
        roundBatches,
        committed,
        revealed,
        // Pseudonim penelaah tampil bersama rekomendasinya (matriks insentif publik); tanpa identitas orang.
        reviews: reviewsVisible
          ? reveals.map((r) => ({ pseudonym: r.reviewerPseudonym, recommendation: r.recommendation, reviewUrl: this.url(r.reviewURI), revealedAt: r.revealedAt }))
          : null,
      },
      decision,
      decisions,
      // Pasca-publikasi (M8): DOI bila sudah terbit. Nama penulis tidak ada di sini; lihat GET /articles/:id.
      publication: await this.records.getFinal(sessionId).then((f) => f && { doi: f.doi, doiTokenId: f.doiTokenId, publishedAt: f.publishedAt }),
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
