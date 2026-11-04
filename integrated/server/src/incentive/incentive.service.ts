/**
 * Penyelesaian insentif satu sesi (arsitektur bagian 6): dari reveal penelaah sampai kredit imbalan on-chain.
 *
 *   baris matriks = pseudonim yang reveal (D3, dicek lagi on-chain oleh kontrak lewat `hasReveal`)
 *   q1 = waktu commit - waktu batch dicatat (timestamp on-chain, REAL)
 *   q2, q3 = QoSProvider atas teks telaah (publik setelah reveal) dan abstrak naskah anonim (SIMULASI)
 *   q4 = tingkat reputasi yang dibuktikan penelaah (bukti SIMULASI, saldo REAL)
 *   bobot = kebijakan jurnal yang dikunci saat sesi dibuat (D1), tanpa editor
 *
 * Laporan QoS lengkap (masukan, bobot, matriks, dan yang dikirim ke kontrak) diunggah ke storage publik dan
 * hash-nya masuk transaksi `executeDistribution`, sehingga siapa pun bisa memeriksa ulang hitungannya.
 * TOPSIS, sigmoid, dan pembagian escrow dijalankan kontrak.
 *
 * `settle` idempoten: aman dipanggil ulang setelah crash atau tiap kali sesi dimajukan.
 */
import { Inject, Injectable, Logger } from "@nestjs/common";
import { keccak256, type Address, type Hex } from "viem";
import { MAX_REVIEWERS_PER_SESSION, gatewayUrl, type StorageProvider } from "@decpub/shared";
import { computeSettlement, resolvePolicy, type QoSProvider, type QosRow } from "@decpub/incentive-core";
import { ChainService } from "../chain/chain.service.js";
import { EscrowState, IncentiveReader } from "../chain/incentive-reader.service.js";
import { SessionReader } from "../chain/session-reader.service.js";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { RoundService, type Participant } from "../flows/rounds.service.js";
import { JournalsRepository } from "../journals/journals.repository.js";
import { ManuscriptsRepository } from "../manuscripts/manuscripts.repository.js";
import { PUBLIC_STORAGE } from "../storage/storage.module.js";
import { IncentiveRepository, type LockedPolicy } from "./incentive.repository.js";
import { QOS_PROVIDER } from "./qos.provider.js";

const SECONDS_PER_DAY = 86_400;
const cidOfUri = (uri: string) => uri.replace(/^ipfs:\/\//, "");
const dec = new TextDecoder();

export type SettleResult =
  | { outcome: "distributed"; reviewers: number; reportCid: string; reportHash: Hex; txHash: Hex; matchesModel: boolean }
  | { outcome: "skipped"; reason: string };

/** Isi laporan QoS yang dipublikasikan. Bilangan bulat besar sebagai string desimal agar JSON aman. */
export interface QosReport {
  schema: "decpub.qos-report.v1";
  sessionId: Hex;
  generatedAt: string;
  qosProvider: string;
  policy: LockedPolicy["policy"];
  policyHash: Hex;
  escrowWei: string;
  rows: Array<{
    pseudonym: Address;
    batch: number;
    q1Days: number;
    q2: number;
    q3: number;
    tier: number;
    q4: number;
  }>;
  normalized: number[][];
  weights: { bwm: number[]; bwmConsistencyRatio: number; ecwm: number[]; fused: number[] };
  /** Persis yang dikirim ke `IncentiveEngine.executeDistribution` (skala 1e18). */
  onchainInput: { pseudonyms: Address[]; matrixE18: string[][]; weightsE18: string[] };
  /** Hasil model bilangan bulat yang meniru kontrak, untuk dibandingkan dengan event on-chain. */
  expected: { topsisScores: string[]; sigmoidValues: string[]; rewardsWei: string[] };
  /** Pratinjau floating-point fungsi sigmoid kontrak (D5), bukan logistik Hugo. */
  preview: { topsisScores: number[]; shares: number[] };
  notes: string[];
}

@Injectable()
export class IncentiveService {
  private readonly log = new Logger(IncentiveService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PUBLIC_STORAGE) private readonly storage: StorageProvider,
    @Inject(QOS_PROVIDER) private readonly qos: QoSProvider,
    private readonly chain: ChainService,
    private readonly reader: SessionReader,
    private readonly ireader: IncentiveReader,
    private readonly rounds: RoundService,
    private readonly repo: IncentiveRepository,
    private readonly journals: JournalsRepository,
    private readonly manuscripts: ManuscriptsRepository,
  ) {}

  /** Mengunci kebijakan bobot jurnal untuk sesi ini. Dipanggil saat sesi dibuat. Idempoten. */
  lockPolicyFor(sessionId: string, journalId: number, late = false): LockedPolicy {
    const existing = this.repo.policyOf(sessionId);
    if (existing) return existing;
    const journal = this.journals.get(journalId);
    if (!journal) throw new Error(`Jurnal ${journalId} tidak ditemukan`);
    return this.repo.lockPolicy({ sessionId, journalId, policy: resolvePolicy(journal.weightPolicy), late });
  }

  /** Kebijakan terkunci; untuk sesi yang dibuat sebelum penguncian ada, kebijakan jurnal saat ini dikunci sekarang (ditandai). */
  private policyFor(sessionId: string): LockedPolicy {
    const existing = this.repo.policyOf(sessionId);
    if (existing) return existing;
    const m = this.manuscripts.bySession(sessionId);
    if (!m) throw new Error("Naskah untuk sesi ini tidak ada di server");
    return this.lockPolicyFor(sessionId, m.journalId, true);
  }

  // ------------------------------------------------------------------ penyelesaian

  async settle(sessionId: Hex): Promise<SettleResult> {
    const escrow = await this.ireader.escrow(sessionId);
    if (escrow.stateValue === EscrowState.None) return { outcome: "skipped", reason: "tidak ada escrow terikat" };
    if (escrow.stateValue !== EscrowState.Bound) return { outcome: "skipped", reason: `escrow ${escrow.state}` };
    if ((await this.ireader.distribution(sessionId)).executed) return { outcome: "skipped", reason: "sudah didistribusikan" };
    if (!(await this.ireader.distributable(sessionId))) return { outcome: "skipped", reason: "belum memenuhi syarat distribusi (belum ada keputusan atau status belum final)" };

    const { rows, notes, batchOf } = await this.collectRows(sessionId);
    if (rows.length === 0) return { outcome: "skipped", reason: "tidak ada penelaah yang reveal" };

    const locked = this.policyFor(sessionId);
    if (locked.lockedLate) notes.push("Kebijakan bobot dikunci saat penyelesaian karena sesi dibuat sebelum penguncian ada");
    const s = computeSettlement(rows, escrow.amount, locked.policy);
    const pseudonyms = rows.map((r) => r.pseudonym as Address);

    const report: QosReport = {
      schema: "decpub.qos-report.v1",
      sessionId,
      generatedAt: new Date().toISOString(),
      qosProvider: this.qos.name,
      policy: locked.policy,
      policyHash: locked.policyHash,
      escrowWei: escrow.amount.toString(),
      rows: rows.map((r, i) => ({
        pseudonym: r.pseudonym as Address,
        batch: batchOf.get(r.pseudonym.toLowerCase()) ?? 0,
        q1Days: r.q1Days,
        q2: r.q2,
        q3: r.q3,
        tier: r.tier,
        q4: s.raw[i][3],
      })),
      normalized: s.normalized,
      weights: { bwm: s.bwmWeights, bwmConsistencyRatio: s.bwmConsistencyRatio, ecwm: s.ecwmWeights, fused: s.fusedWeights },
      onchainInput: {
        pseudonyms,
        matrixE18: s.matrixE18.map((row) => row.map(String)),
        weightsE18: s.weightsE18.map(String),
      },
      expected: {
        topsisScores: s.expected.scores.map(String),
        sigmoidValues: s.expected.sigmoidValues.map(String),
        rewardsWei: s.expected.amounts.map(String),
      },
      preview: { topsisScores: s.preview.topsisScores, shares: s.preview.shares },
      notes,
    };
    const reportBytes = new TextEncoder().encode(JSON.stringify(report));
    const qosReportHash = keccak256(reportBytes);
    const put = await this.storage.put(reportBytes, "qos-report.json");

    const tx = await this.chain.write("operator", "IncentiveEngine", "executeDistribution", [
      { sessionId, matrix: s.matrixE18, weights: s.weightsE18, pseudonyms, qosReportHash, policyHash: locked.policyHash },
    ]);
    this.repo.saveReport({ sessionId, reportCid: put.cid, reportHash: qosReportHash, txHash: tx.txHash, executedAt: new Date().toISOString() });

    // Kontrak adalah sumber kebenaran; bandingkan dengan model bilangan bulat sebagai pemeriksaan silang.
    let matchesModel = true;
    for (let i = 0; i < pseudonyms.length; i++) {
      if ((await this.ireader.rewardCredit(sessionId, pseudonyms[i])) !== s.expected.amounts[i]) matchesModel = false;
    }
    if (!matchesModel) this.log.error(`Sesi ${sessionId}: imbalan on-chain berbeda dari model referensi (periksa laporan ${put.cid})`);
    this.log.log(`Sesi ${sessionId}: imbalan didistribusikan ke ${pseudonyms.length} pseudonim (laporan ${put.cid})`);
    return { outcome: "distributed", reviewers: pseudonyms.length, reportCid: put.cid, reportHash: qosReportHash, txHash: tx.txHash, matchesModel };
  }

  /**
   * Baris QoS seluruh pseudonim sesi yang sudah reveal (semua ronde). Bila lebih dari 10 (D2), 10 yang terbaru
   * dipakai: kontrak menolak lebih dari 10 baris; ini terjadi hanya pada beberapa ronde dengan zona abu-abu.
   */
  private async collectRows(sessionId: Hex): Promise<{ rows: QosRow[]; notes: string[]; batchOf: Map<string, number> }> {
    const notes: string[] = [];
    const latest = await this.reader.latestBatchNumber(sessionId);
    const batches = Array.from({ length: latest }, (_, i) => i + 1);
    const revealed: Participant[] = await this.rounds.revealed(sessionId, batches);
    revealed.sort((a, b) => a.invite.slot - b.invite.slot);

    let chosen = revealed;
    if (revealed.length > MAX_REVIEWERS_PER_SESSION) {
      chosen = revealed.slice(revealed.length - MAX_REVIEWERS_PER_SESSION);
      notes.push(
        `${revealed.length} pseudonim reveal; hanya ${MAX_REVIEWERS_PER_SESSION} terbaru yang dihitung (batas kontrak D2). ` +
          `Dikecualikan: ${revealed.slice(0, revealed.length - MAX_REVIEWERS_PER_SESSION).map((p) => p.pseudonym).join(", ")}`,
      );
    }

    const session = await this.reader.getSession(sessionId);
    const paperText = await this.paperText(session.metadataURI);
    const batchOf = new Map<string, number>();
    const rows: QosRow[] = [];
    for (const p of chosen) {
      const batch = await this.reader.batch(sessionId, p.invite.slot);
      const commit = await this.reader.commitRecord(sessionId, p.pseudonym);
      const reveal = await this.reader.revealRecord(sessionId, p.pseudonym);
      if (!batch || !commit || !reveal) continue; // tidak mungkin bila hasReveal benar; jangan jatuhkan seluruh penyelesaian
      const text = await this.reviewText(reveal.reviewURI);
      rows.push({
        pseudonym: p.pseudonym,
        q1Days: Math.max(0, commit.committedAt - batch.recordedAt) / SECONDS_PER_DAY,
        q2: await this.qos.relevance(text, paperText),
        q3: await this.qos.actionability(text),
        tier: this.repo.tierOf(sessionId, p.pseudonym) ?? 0,
      });
      batchOf.set(p.pseudonym.toLowerCase(), p.invite.slot);
    }
    return { rows, notes, batchOf };
  }

  /** Teks naskah untuk q2: judul, abstrak, dan kata kunci dari metadata publik (anonim), bukan dari PDF bersampul. */
  private async paperText(metadataUri: string): Promise<string> {
    try {
      const meta = JSON.parse(dec.decode(await this.storage.get(cidOfUri(metadataUri)))) as { title?: string; abstract?: string; keywords?: string[] };
      return [meta.title, meta.abstract, ...(meta.keywords ?? [])].filter(Boolean).join(" ");
    } catch {
      return "";
    }
  }

  private async reviewText(reviewUri: string): Promise<string> {
    const doc = JSON.parse(dec.decode(await this.storage.get(cidOfUri(reviewUri)))) as { text?: string };
    return doc.text ?? "";
  }

  // ------------------------------------------------------------------ tampilan publik

  async view(sessionId: Hex) {
    const [escrow, dist, refundable, distributable] = await Promise.all([
      this.ireader.escrow(sessionId),
      this.ireader.distribution(sessionId),
      this.ireader.refundable(sessionId),
      this.ireader.distributable(sessionId),
    ]);
    const policy = this.repo.policyOf(sessionId);
    const base = {
      sessionId,
      escrow: { state: escrow.state, amountWei: escrow.amount.toString(), unclaimedWei: escrow.unclaimed.toString(), refundable, distributable },
      policy: policy && { preset: policy.preset, lambda: policy.lambda, hash: policy.policyHash, lockedAt: policy.lockedAt, lockedLate: policy.lockedLate, detail: policy.policy },
    };
    if (!dist.executed) return { ...base, distribution: null };

    const ref = this.repo.reportOf(sessionId);
    let report: QosReport | null = null;
    let reportMatchesOnChain = false;
    if (ref) {
      const bytes = await this.storage.get(ref.reportCid);
      reportMatchesOnChain = keccak256(bytes).toLowerCase() === dist.qosReportHash.toLowerCase();
      report = JSON.parse(dec.decode(bytes)) as QosReport;
    }
    const rows = [];
    for (const r of report?.rows ?? []) {
      const remaining = await this.ireader.rewardCredit(sessionId, r.pseudonym);
      const i = report!.onchainInput.pseudonyms.findIndex((p) => p.toLowerCase() === r.pseudonym.toLowerCase());
      rows.push({
        ...r,
        score: report!.expected.topsisScores[i],
        sigmoid: report!.expected.sigmoidValues[i],
        rewardWei: report!.expected.rewardsWei[i],
        claimed: remaining === 0n,
      });
    }
    return {
      ...base,
      distribution: {
        reviewerCount: dist.reviewerCount,
        executedAt: dist.executedAt,
        qosReportHash: dist.qosReportHash,
        policyHash: dist.policyHash,
        policyMatchesLocked: policy ? policy.policyHash.toLowerCase() === dist.policyHash.toLowerCase() : null,
        reportCid: ref?.reportCid ?? null,
        reportUrl: ref ? gatewayUrl(this.config.storage, ref.reportCid) : null,
        reportMatchesOnChain,
        txHash: ref?.txHash ?? null,
        qosProvider: report?.qosProvider ?? null,
        weights: report?.weights ?? null,
        rows,
      },
    };
  }
}
