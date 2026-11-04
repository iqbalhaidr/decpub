/**
 * Audit trail sesi: kronologi event on-chain, bukan snapshot terbaru per fase seperti di Ciko
 * (`public.controller.ts:21`). Membaca log semua kontrak yang relevan, menyaring yang
 * menyangkut sesi, mengurutkan menurut (blok, indeks log), dan memberi keterangan ringkas.
 *
 * Log dibaca per jendela blok (`LOG_WINDOW`) karena RPC publik membatasi rentang `eth_getLogs`.
 * Hanya data yang memang publik on-chain; tidak ada nama, surel, atau pemetaan akun-pseudonim.
 */
import { Inject, Injectable } from "@nestjs/common";
import { parseEventLogs, type Abi, type Hex } from "viem";
import {
  AUTOMATIC_CHECK_RESULT_NAMES,
  DECISION_OUTCOME_NAMES,
  DESK_DECISION_NAMES,
  RECOMMENDATION_NAMES,
  REVIEW_PHASE_NAMES,
  ROLE_NAMES,
  statusName,
} from "@decpub/shared";
import { ABIS, ChainService, type ContractName } from "../chain/chain.service.js";
import { APP_CONFIG, type AppConfig } from "../config/config.js";

/** Kontrak yang mengeluarkan event sesi, dalam urutan tampil bila blok dan indeks sama. */
const SOURCES: ContractName[] = [
  "EphemeralAccounts",
  "PublicationSessions",
  "AutomaticChecks",
  "EditorialScreenings",
  "AssignmentProofs",
  "ReviewerSelections",
  "ReviewSubmissions",
  "ReviewDecisions",
  "ActionGateway",
];

export interface AuditEntry {
  order: number;
  blockNumber: number;
  timestamp: number;
  txHash: Hex;
  logIndex: number;
  contract: string;
  event: string;
  summary: string;
  args: Record<string, string | number | boolean>;
}

type Args = Record<string, unknown>;

const short = (h: unknown) => (typeof h === "string" ? `${h.slice(0, 10)}…` : String(h));
const roleName = (v: unknown) => (typeof v === "number" || typeof v === "bigint" ? ROLE_NAMES[Number(v)] : String(v));

/** Keterangan ringkas per event (bahasa Indonesia). */
const SUMMARIZE: Record<string, (a: Args) => string> = {
  EphemeralAccountCreated: (a) => `Pseudonim ${roleName(a.role)} dibuat (${short(a.pseudonym)})`,
  PublicationSessionCreated: (a) => `Sesi diajukan oleh pseudonim Author ${short(a.authorPseudonym)}`,
  PublicationStatusUpdated: (a) => `Status ${statusName(Number(a.previousStatus))} → ${statusName(Number(a.newStatus))}`,
  EditorAssigned: (a) => `Editor ditugaskan (${short(a.editorPseudonym)})`,
  ManuscriptRevisionRecorded: (a) => `Revisi ke-${a.revisionCount} dicatat`,
  ReviewerCriteriaRecorded: (a) => `Kriteria penelaah dicatat (${a.reviewerCount} penelaah)`,
  AutomaticCheckRecorded: (a) => `Pengecekan otomatis: ${AUTOMATIC_CHECK_RESULT_NAMES[Number(a.result)] ?? a.result}`,
  EditorialScreeningRecorded: (a) => `Putusan editorial: ${DESK_DECISION_NAMES[Number(a.decision)] ?? a.decision}`,
  EditorAssignmentProofRecorded: () => "Bukti penugasan editor dicatat",
  ReviewerAssignmentProofRecorded: (a) => `Bukti penugasan penelaah dicatat (${short(a.reviewerAssignmentCommitment)})`,
  ReviewerSelectionBatchRecorded: (a) => `Batch penelaah ${a.batch} dipilih (${a.selectedCount} penelaah)`,
  ReviewerSelected: (a) => `Penelaah batch ${a.batch} terpilih (${short(a.reviewerAssignmentCommitment)})`,
  AssignmentBound: (a) => `Penugasan ${short(a.assignmentCommitment)} diikat ke pseudonim ${short(a.pseudonym)}`,
  ReviewPhaseUpdated: (a) => `Fase telaah ${REVIEW_PHASE_NAMES[Number(a.previousPhase)]} → ${REVIEW_PHASE_NAMES[Number(a.newPhase)]}`,
  ReviewCommitted: (a) => `Commit telaah dari pseudonim ${short(a.reviewerPseudonym)} (isi belum terbuka)`,
  ReviewRevealed: (a) => `Reveal telaah ${short(a.reviewerPseudonym)}: ${RECOMMENDATION_NAMES[Number(a.recommendation)] ?? a.recommendation}`,
  ReviewBatchDecided: (a) =>
    `Keputusan batch ${a.batch}: ${a.grayZone ? "zona abu-abu" : (DECISION_OUTCOME_NAMES[Number(a.outcome)] ?? a.outcome)} ` +
    `(Reject ${a.rejectCount}, Major ${a.majorRevisionCount}, Minor ${a.minorRevisionCount}, Accept ${a.acceptAsIsCount})`,
};

const plain = (v: unknown): string | number | boolean => (typeof v === "bigint" ? v.toString() : (v as string | number | boolean));

@Injectable()
export class AuditTrailService {
  private readonly blockTimes = new Map<number, number>();

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly chain: ChainService,
  ) {}

  async forSession(sessionId: Hex): Promise<AuditEntry[]> {
    const sid = sessionId.toLowerCase();
    const client = this.chain.publicClient;
    const latest = Number(await client.getBlockNumber({ cacheTime: 0 }));
    const from = this.config.logFromBlock;
    const window = this.config.logWindow;

    const raw: Array<{ contract: ContractName; log: ReturnType<typeof parseEventLogs>[number] }> = [];
    for (const name of SOURCES) {
      const address = this.chain.addressOf(name);
      for (let start = from; start <= latest; start += window) {
        const end = Math.min(start + window - 1, latest);
        const logs = await client.getLogs({ address, fromBlock: BigInt(start), toBlock: BigInt(end) });
        const parsed = parseEventLogs({ abi: ABIS[name] as Abi, logs, strict: false });
        for (const log of parsed) {
          const args = (log as { args?: Args }).args ?? {};
          if (String(args.sessionId ?? "").toLowerCase() === sid) raw.push({ contract: name, log });
        }
      }
    }

    raw.sort((x, y) => Number(x.log.blockNumber! - y.log.blockNumber!) || x.log.logIndex! - y.log.logIndex!);
    const out: AuditEntry[] = [];
    for (const { contract, log } of raw) {
      const a = (log as { args?: Args }).args ?? {};
      const event = (log as { eventName?: string }).eventName ?? "?";
      const args: Record<string, string | number | boolean> = {};
      for (const [k, v] of Object.entries(a)) args[k] = plain(v);
      out.push({
        order: out.length + 1,
        blockNumber: Number(log.blockNumber),
        timestamp: await this.timeOf(Number(log.blockNumber)),
        txHash: log.transactionHash!,
        logIndex: log.logIndex!,
        contract,
        event,
        summary: (SUMMARIZE[event] ?? (() => event))(a),
        args,
      });
    }
    return out;
  }

  private async timeOf(blockNumber: number): Promise<number> {
    const hit = this.blockTimes.get(blockNumber);
    if (hit !== undefined) return hit;
    const b = await this.chain.publicClient.getBlock({ blockNumber: BigInt(blockNumber) });
    this.blockTimes.set(blockNumber, Number(b.timestamp));
    return Number(b.timestamp);
  }
}
