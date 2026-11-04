/**
 * Artikel terbit (P08): daftar, detail, open review, statistik agregat, dan kontribusi milik sendiri.
 *
 * Semua yang tampil publik berasal dari chain (`PublicationRecords`), storage publik, dan pengungkapan atas
 * pilihan penulis. Tidak ada nama, surel, atau pemetaan akun-pseudonim kecuali yang sengaja dibuka lewat
 * selective disclosure. Berkas di storage diambil lalu hash-nya dicocokkan dengan on-chain (storage tidak dipercaya).
 */
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { keccak256, type Hex } from "viem";
import { PublicationStatus, Role, attributesHash, gatewayUrl, type StorageProvider } from "@decpub/shared";
import { SessionReader } from "../chain/session-reader.service.js";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { RoundService } from "../flows/rounds.service.js";
import { sha256Hex, type PublicMetadata } from "../manuscripts/intake.service.js";
import { ManuscriptsRepository } from "../manuscripts/manuscripts.repository.js";
import { InvitationsRepository } from "../selection/invitations.repository.js";
import { PUBLIC_STORAGE } from "../storage/storage.module.js";
import { UsersRepository } from "../users/users.repository.js";
import { VerificationService } from "../verification/verification.service.js";
import { PublicationRepository } from "./publication.repository.js";
import { RecordsService, type FinalView } from "./records.service.js";

const cidOfUri = (uri: string) => uri.replace(/^ipfs:\/\//, "");

export interface ArticleSummary {
  sessionId: Hex;
  doi: string;
  doiTokenId: number;
  title: string;
  abstract: string;
  keywords: string[];
  journal: PublicMetadata["journal"] | null;
  publishedAt: number;
  revisionCount: number;
  /** Nama penulis hanya bila penulis memilih membukanya. */
  authorName: string | null;
  authorDisclosed: boolean;
}

@Injectable()
export class ArticlesService {
  /** Berkas publik tak berubah (content-addressed): cukup diambil sekali. */
  private readonly jsonCache = new Map<string, unknown>();
  private readonly verifiedFiles = new Map<string, boolean>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PUBLIC_STORAGE) private readonly storage: StorageProvider,
    private readonly reader: SessionReader,
    private readonly records: RecordsService,
    private readonly repo: PublicationRepository,
    private readonly rounds: RoundService,
    private readonly invitations: InvitationsRepository,
    private readonly manuscripts: ManuscriptsRepository,
    private readonly users: UsersRepository,
    private readonly verification: VerificationService,
  ) {}

  private url(uri: string) {
    return gatewayUrl(this.config.storage, cidOfUri(uri));
  }

  private async publicMetadata(uri: string): Promise<PublicMetadata | null> {
    const cid = cidOfUri(uri);
    if (this.jsonCache.has(cid)) return this.jsonCache.get(cid) as PublicMetadata;
    try {
      const m = JSON.parse(new TextDecoder().decode(await this.storage.get(cid))) as PublicMetadata;
      this.jsonCache.set(cid, m);
      return m;
    } catch {
      return null; // storage tidak terjangkau: daftar tetap tampil tanpa judul
    }
  }

  private async mustFinal(sessionId: Hex): Promise<FinalView> {
    const f = await this.records.getFinal(sessionId);
    if (!f) throw new NotFoundException("Artikel belum terbit atau tidak ditemukan");
    return f;
  }

  // ---------------------------------------------------------------- daftar

  async list(): Promise<ArticleSummary[]> {
    const out: ArticleSummary[] = [];
    for (const sessionId of (await this.records.recordedSessions()).reverse()) {
      const f = (await this.records.getFinal(sessionId))!;
      const meta = await this.publicMetadata(f.metadataURI);
      const disclosed = this.repo.disclosure(sessionId, Role.Author);
      out.push({
        sessionId,
        doi: f.doi,
        doiTokenId: f.doiTokenId,
        title: meta?.title ?? "(metadata tidak terjangkau)",
        abstract: meta?.abstract ?? "",
        keywords: meta?.keywords ?? [],
        journal: meta?.journal ?? null,
        publishedAt: f.publishedAt,
        revisionCount: f.revisionCount,
        authorName: disclosed?.attributes.name ?? null,
        authorDisclosed: !!disclosed,
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- detail

  async detail(sessionId: Hex) {
    const f = await this.mustFinal(sessionId);
    const meta = await this.publicMetadata(f.metadataURI);
    const latest = await this.reader.latestBatchNumber(sessionId);
    const decision = latest > 0 ? await this.reader.decision(sessionId, latest) : null;
    const reviews = await this.allReveals(sessionId);
    return {
      sessionId,
      doi: f.doi,
      doiTokenId: f.doiTokenId,
      publishedAt: f.publishedAt,
      revisionCount: f.revisionCount,
      title: meta?.title ?? null,
      abstract: meta?.abstract ?? "",
      keywords: meta?.keywords ?? [],
      journal: meta?.journal ?? null,
      anonymizedManuscript: { url: this.url(f.anonymizedManuscriptURI), uri: f.anonymizedManuscriptURI, sha256Anonymized: f.anonymizedManuscriptHash },
      metadataUrl: this.url(f.metadataURI),
      hashes: { original: f.originalManuscriptHash, anonymized: f.anonymizedManuscriptHash, metadata: f.metadataHash },
      author: await this.party(sessionId, Role.Author, f),
      editor: await this.party(sessionId, Role.Editor, f),
      // Penelaah TIDAK PERNAH diungkap: hanya jumlah dan rekomendasi per pseudonim lewat open review.
      reviewers: { disclosed: false, reviews: reviews.length },
      decision: decision && { batch: decision.batch, outcome: decision.outcome, grayZone: decision.grayZone, reviewerCount: decision.reviewerCount },
      links: {
        openReview: `/articles/${sessionId}/open-review`,
        comments: `/articles/${sessionId}/comments`,
        incentive: `/incentive/${sessionId}`,
        auditTrail: `/public/sessions/${sessionId}/audit-trail`,
      },
    };
  }

  /** Pengungkapan satu pihak: yang dibuka, bukti bahwa hash-nya cocok dengan on-chain, dan (penulis) naskah asli. */
  private async party(sessionId: Hex, role: 0 | 2, final: FinalView) {
    const onChain = await this.records.getDisclosure(sessionId, role);
    if (!onChain) return { disclosed: false as const };
    const row = this.repo.disclosure(sessionId, role);
    const recomputed = row ? attributesHash(sessionId, role, row.attributes, row.salt as Hex) : null;
    let original: { url: string; cid: string; uploaded: boolean; sha256MatchesOnChain: boolean | null; expectedHash: Hex } | null = null;
    if (onChain.originalManuscriptURI) {
      const cid = cidOfUri(onChain.originalManuscriptURI);
      const uploaded = !!row?.originalUploadedAt;
      original = {
        url: this.url(onChain.originalManuscriptURI),
        cid,
        uploaded,
        sha256MatchesOnChain: uploaded ? await this.fileMatches(cid, final.originalManuscriptHash) : null,
        expectedHash: final.originalManuscriptHash,
      };
    }
    return {
      disclosed: true as const,
      attributes: row?.attributes ?? null,
      salt: row?.salt ?? null,
      attributesHash: onChain.attributesHash,
      /** Hash dihitung ulang dari atribut dan salt yang tampil = hash yang tercatat on-chain. */
      attributesVerified: recomputed !== null && recomputed.toLowerCase() === onChain.attributesHash.toLowerCase(),
      permanentAccount: onChain.permanentAccount,
      pseudonym: onChain.pseudonym,
      disclosedAt: onChain.disclosedAt,
      originalManuscript: original,
    };
  }

  private async fileMatches(cid: string, expectedSha256: Hex): Promise<boolean> {
    const hit = this.verifiedFiles.get(cid);
    if (hit !== undefined) return hit;
    let ok = false;
    try {
      ok = sha256Hex(await this.storage.get(cid)).toLowerCase() === expectedSha256.toLowerCase();
    } catch {
      return false; // tidak disimpan di cache: coba lagi nanti
    }
    this.verifiedFiles.set(cid, ok);
    return ok;
  }

  // ----------------------------------------------------------- open review

  /** Seluruh reveal sesi, dikelompokkan per batch. */
  private async allReveals(sessionId: Hex) {
    const latest = await this.reader.latestBatchNumber(sessionId);
    const out: Array<{ batch: number; pseudonym: Hex; reveal: NonNullable<Awaited<ReturnType<SessionReader["revealRecord"]>>> }> = [];
    for (let b = 1; b <= latest; b++) {
      for (const p of await this.rounds.bound(sessionId, [b])) {
        const reveal = await this.reader.revealRecord(sessionId, p.pseudonym);
        if (reveal) out.push({ batch: b, pseudonym: p.pseudonym, reveal });
      }
    }
    return out;
  }

  /** Panel open review (F20 Ciko, `OpenReviewPanel.tsx` Roihan): laporan editorial dan telaah per batch, tanpa identitas. */
  async openReview(sessionId: Hex) {
    const f = await this.mustFinal(sessionId);
    const editorial = [];
    for (let rev = 0; rev <= f.revisionCount; rev++) {
      const e = await this.reader.editorialRecord(sessionId, rev);
      if (!e) continue;
      const doc = await this.fetchDoc(e.anonymousEditorialReportURI, e.anonymousEditorialReportHash);
      editorial.push({
        revision: rev,
        decision: e.decision,
        comments: (doc?.json as { comments?: string } | undefined)?.comments ?? null,
        reviewerCriteria: (doc?.json as { reviewerCriteria?: unknown } | undefined)?.reviewerCriteria ?? null,
        reportUrl: this.url(e.anonymousEditorialReportURI),
        hashVerified: doc?.verified ?? false,
      });
    }

    const latest = await this.reader.latestBatchNumber(sessionId);
    const reveals = await this.allReveals(sessionId);
    const batches = [];
    for (let b = 1; b <= latest; b++) {
      const d = await this.reader.decision(sessionId, b);
      const reviews = [];
      for (const r of reveals.filter((x) => x.batch === b)) {
        const doc = await this.fetchDoc(r.reveal.reviewURI, r.reveal.reviewHash);
        reviews.push({
          pseudonym: r.pseudonym,
          recommendation: r.reveal.recommendation,
          text: (doc?.json as { text?: string } | undefined)?.text ?? null,
          reviewUrl: this.url(r.reveal.reviewURI),
          hashVerified: doc?.verified ?? false,
          revealedAt: r.reveal.revealedAt,
        });
      }
      batches.push({
        batch: b,
        decision: d && { outcome: d.outcome, grayZone: d.grayZone, reviewerCount: d.reviewerCount, additionalReviewerCount: d.additionalReviewerCount },
        reviews,
      });
    }
    return {
      sessionId,
      doi: f.doi,
      note: "Pseudonim penelaah berlaku per putaran dan tidak dapat ditautkan ke orang. Tidak ada nama atau surel.",
      editorial,
      batches,
    };
  }

  private async fetchDoc(uri: string, expectedKeccak: Hex): Promise<{ json: unknown; verified: boolean } | null> {
    try {
      const bytes = await this.storage.get(cidOfUri(uri));
      return { json: JSON.parse(new TextDecoder().decode(bytes)), verified: keccak256(bytes).toLowerCase() === expectedKeccak.toLowerCase() };
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------ agregat

  /**
   * Kontribusi agregat tingkat platform: angka saja, tanpa menyebut sesi, orang, atau pseudonim
   * (laporan Ciko hlm. 85: "+1 kontribusi" tanpa menyebut publikasi).
   */
  async stats() {
    const sessions = await this.records.recordedSessions();
    const byJournal = new Map<string, number>();
    let reviews = 0;
    for (const sid of sessions) {
      const f = (await this.records.getFinal(sid))!;
      const meta = await this.publicMetadata(f.metadataURI);
      const j = meta?.journal.name ?? "(tidak diketahui)";
      byJournal.set(j, (byJournal.get(j) ?? 0) + 1);
      reviews += (await this.allReveals(sid)).length;
    }
    return {
      articlesPublished: sessions.length,
      byJournal: [...byJournal].map(([journal, articles]) => ({ journal, articles })),
      reviewsOnPublishedArticles: reviews,
      authorsDisclosed: this.repo.countDisclosures(Role.Author),
      editorsDisclosed: this.repo.countDisclosures(Role.Editor),
      commentsPosted: this.repo.countComments(),
      reviewersWithVerifiedFields: this.users.countVerifiedReviewers(),
      pendingFieldVerifications: this.verification.listPending().length,
    };
  }

  /** Kontribusi milik pengguna sendiri (hanya jumlah). Penelaah dihitung bila review-nya sudah dibuka (reveal). */
  async contributions(userId: string) {
    let authored = 0;
    for (const m of this.manuscripts.listByOwner(userId)) {
      if ((await this.reader.getSession(m.sessionId as Hex)).statusValue === PublicationStatus.Published) authored++;
    }
    let edited = 0;
    let reviewed = 0;
    for (const i of [...this.invitations.forUser(userId, "editor"), ...this.invitations.forUser(userId, "reviewer")]) {
      if (i.voidedAt || (i.role === "editor" && !i.acceptedAt)) continue;
      const sid = i.sessionId as Hex;
      const owner = await this.reader.assignmentOwner(sid, i.assignmentCommitment as Hex);
      if (i.role === "editor") {
        if ((await this.reader.getSession(sid)).statusValue === PublicationStatus.Published) edited++;
      } else if (owner && (await this.reader.hasReveal(sid, owner))) {
        reviewed++;
      }
    }
    return { articlesPublished: authored, editorialScreenings: edited, reviewsSubmitted: reviewed };
  }
}
