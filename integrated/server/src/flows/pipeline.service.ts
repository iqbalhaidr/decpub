/**
 * Orkestrasi P02-P04: dari sesi dibuat sampai `UnderEditorialScreening`.
 *
 *   submit  : meneruskan `createSessionSigned` (tanda tangan pseudonim Author) setelah
 *             memeriksa bahwa isinya sama dengan hasil intake.
 *   advance : menjalankan langkah sistem yang menunggu, sesuai status on-chain:
 *               Submitted / UnderAutomaticChecking -> P03 (cek, unggah laporan, catat)
 *               UnderAnonymization                 -> P04 (unggah anonim, majukan status)
 *               Incomplete                         -> hanya bila `recheck` (P03 ulang)
 *             Status on-chain adalah sumber kebenaran, jadi `advance` aman dipanggil ulang.
 *
 * Refund APC untuk Reject/desk reject menyusul di M7 (`ESCROW_REQUIRED`).
 */
import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Hex } from "viem";
import { PublicationStatus, type CreateSessionAction, type StorageProvider } from "@decpub/shared";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import type { TxReceipt } from "../chain/chain.service.js";
import { GatewayService } from "../chain/gateway.service.js";
import { SessionReader } from "../chain/session-reader.service.js";
import { AnonymizationService } from "../manuscripts/anonymization.service.js";
import { ChecksService, type CheckReport } from "../manuscripts/checks.service.js";
import { ManuscriptsRepository, type ManuscriptRow } from "../manuscripts/manuscripts.repository.js";
import { PUBLIC_STORAGE } from "../storage/storage.module.js";

export interface SignedSubmission {
  action: Omit<CreateSessionAction, "nonce"> & { nonce: string };
  signature: Hex;
}

export type StepResult =
  | { step: "P03"; result: CheckReport["result"]; reportUri: string; plagiarismScore: number; warnings: string[]; tx: TxReceipt }
  | { step: "P04"; anonymizedCid: string; tx: TxReceipt };

export interface AdvanceResult {
  sessionId: Hex;
  steps: StepResult[];
  status: string;
}

@Injectable()
export class PipelineService {
  private readonly log = new Logger(PipelineService.name);
  /** Mencegah dua `advance` bersamaan untuk naskah yang sama (mis. klik ganda). */
  private readonly running = new Set<string>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PUBLIC_STORAGE) private readonly storage: StorageProvider,
    private readonly gateway: GatewayService,
    private readonly reader: SessionReader,
    private readonly checks: ChecksService,
    private readonly anonymization: AnonymizationService,
    private readonly manuscripts: ManuscriptsRepository,
  ) {}

  /** Akses naskah: hanya pemilik. */
  ownedManuscript(manuscriptId: string, userId: string): ManuscriptRow {
    const m = this.manuscripts.byId(manuscriptId);
    // Pesan sama untuk "tidak ada" dan "milik orang lain": tidak membocorkan keberadaan naskah.
    if (!m || m.ownerUserId !== userId) throw new NotFoundException("Naskah tidak ditemukan");
    return m;
  }

  async submit(userId: string, manuscriptId: string, signed: SignedSubmission): Promise<{ tx: TxReceipt; advance?: AdvanceResult }> {
    const m = this.ownedManuscript(manuscriptId, userId);
    if (m.submittedAt) throw new ConflictException("Naskah ini sudah diajukan");

    const a = signed.action;
    const expected: Record<string, string> = {
      sessionId: m.sessionId,
      originalManuscriptHash: m.originalHash,
      anonymizedManuscriptHash: m.anonymizedHash,
      metadataHash: m.metadataHash,
      anonymizedManuscriptURI: m.anonymizedUri,
      metadataURI: m.metadataUri,
    };
    for (const [k, v] of Object.entries(expected)) {
      if (String((a as Record<string, unknown>)[k]).toLowerCase() !== v.toLowerCase()) {
        throw new BadRequestException(`Field ${k} tidak sama dengan hasil intake`);
      }
    }
    const eph = await this.reader.ephemeral(a.pseudonym);
    if (!eph.exists || eph.revoked) throw new BadRequestException("Pseudonim belum dibuat (POST /flows/ephemeral-account)");
    if (eph.role !== "Author" || eph.sessionId.toLowerCase() !== m.sessionId.toLowerCase()) {
      throw new BadRequestException("Pseudonim bukan Author untuk sesi ini");
    }

    const tx = await this.gateway.createSessionSigned({ ...a, nonce: BigInt(a.nonce) }, signed.signature);
    this.manuscripts.markSubmitted(m.id);
    const out: { tx: TxReceipt; advance?: AdvanceResult } = { tx };
    if (this.config.autoAdvance) out.advance = await this.advance(m);
    return out;
  }

  async advance(m: ManuscriptRow, opts: { recheck?: boolean } = {}): Promise<AdvanceResult> {
    if (this.running.has(m.id)) throw new ConflictException("Pemrosesan naskah ini sedang berjalan");
    this.running.add(m.id);
    try {
      const sessionId = m.sessionId as Hex;
      const steps: StepResult[] = [];
      let recheck = opts.recheck ?? false;
      for (let guard = 0; guard < 4; guard++) {
        const s = await this.reader.getSession(sessionId);
        if (s.statusValue === PublicationStatus.Submitted || s.statusValue === PublicationStatus.UnderAutomaticChecking) {
          steps.push(await this.runAutomaticCheck(m));
        } else if (s.statusValue === PublicationStatus.Incomplete && recheck) {
          recheck = false; // satu pengecekan ulang per permintaan
          // Kontrak menolak Incomplete -> Incomplete (InvalidStatus); jalur sahnya lewat UnderAutomaticChecking.
          await this.gateway.updateStatus(sessionId, PublicationStatus.UnderAutomaticChecking);
          steps.push(await this.runAutomaticCheck(m));
        } else if (s.statusValue === PublicationStatus.UnderAnonymization) {
          const r = await this.anonymization.publish(m);
          steps.push({ step: "P04", anonymizedCid: r.anonymizedCid, tx: r.tx });
        } else {
          break;
        }
      }
      return { sessionId, steps, status: (await this.reader.getSession(sessionId)).status };
    } finally {
      this.running.delete(m.id);
    }
  }

  private async runAutomaticCheck(m: ManuscriptRow): Promise<StepResult> {
    const sessionId = m.sessionId as Hex;
    const outcome = await this.checks.runForManuscript(m.id, sessionId);
    // Laporan publik (tanpa identitas) diunggah ke storage; hash-nya dicatat on-chain.
    const put = await this.storage.put(outcome.reportBytes, "automatic-check-report.json");
    const reportUri = `ipfs://${put.cid}`;
    const tx = await this.gateway.recordAutomaticCheck({
      sessionId,
      reportHash: outcome.reportHash,
      flagsHash: outcome.flagsHash,
      reportURI: reportUri,
      result: outcome.resultValue,
    });
    const warnings: string[] = [];
    if (outcome.report.flags.identityExposed) {
      warnings.push(`identityExposed: ${outcome.report.identityExposedFields.join(", ")} masih terbaca di isi naskah anonim (anonimisasi hanya metadata dan sampul, B1)`);
    }
    if (outcome.report.result === "Reject") this.log.log(`Sesi ${sessionId} ditolak di P03 (refund APC menyusul di M7)`);
    return { step: "P03", result: outcome.report.result, reportUri, plagiarismScore: outcome.report.plagiarism.score, warnings, tx };
  }
}
