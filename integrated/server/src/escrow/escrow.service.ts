/**
 * Escrow APC di sisi server: relayer untuk `bindNote`, `refund`, dan `claimReward`.
 *
 * Server TIDAK memegang rahasia note dan tidak tahu note mana milik siapa: ia hanya meneruskan aksi yang sudah
 * dibuktikan klien (bukti ZK simulasi) atau ditandatangani pseudonim. Bukti dan tanda tangan mengikat semua
 * parameter (sesi, nullifier, penerima), jadi relayer tidak bisa mengalihkan dana. Aksi ini boleh dikirim siapa
 * saja, sehingga tidak butuh JWT.
 */
import { ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Address, Hex } from "viem";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { ChainService, type TxReceipt } from "../chain/chain.service.js";
import { EscrowState, IncentiveReader } from "../chain/incentive-reader.service.js";
import { SessionReader } from "../chain/session-reader.service.js";
import { PipelineService, type AdvanceResult } from "../flows/pipeline.service.js";
import { ProgressService } from "../flows/progress.service.js";
import { ManuscriptsRepository } from "../manuscripts/manuscripts.repository.js";

@Injectable()
export class EscrowService {
  private readonly log = new Logger(EscrowService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly chain: ChainService,
    private readonly reader: SessionReader,
    private readonly ireader: IncentiveReader,
    private readonly pipeline: PipelineService,
    private readonly progress: ProgressService,
    private readonly manuscripts: ManuscriptsRepository,
  ) {}

  /** Status escrow sebuah sesi (publik: jumlah dan status, tanpa note atau penyetor). */
  async status(sessionId: Hex) {
    const e = await this.ireader.escrow(sessionId);
    return {
      sessionId,
      state: e.state,
      amountWei: e.amount.toString(),
      boundAt: e.boundAt || null,
      unclaimedWei: e.unclaimed.toString(),
      refundable: await this.ireader.refundable(sessionId),
      distributable: await this.ireader.distributable(sessionId),
      escrowRequired: this.config.escrowRequired,
    };
  }

  /** P02: mengikat note ke sesi (relay `EscrowPool.bindNote`), lalu melanjutkan P03 bila sesi sudah diajukan. */
  async bind(p: { sessionId: Hex; nullifier: Hex; proof: Hex }): Promise<{ tx: TxReceipt; advance?: AdvanceResult | { error: string } }> {
    if (!(await this.reader.sessionExists(p.sessionId))) throw new NotFoundException("Sesi belum ada di chain (ajukan dulu, lalu ikat APC)");
    const e = await this.ireader.escrow(p.sessionId);
    if (e.stateValue !== EscrowState.None) throw new ConflictException({ error: "ESCROW_ALREADY_BOUND", message: `Sesi ini sudah punya escrow (${e.state})` });
    const tx = await this.chain.write("operator", "EscrowPool", "bindNote", [p.sessionId, p.nullifier, p.proof]);
    this.log.log(`APC terikat ke sesi ${p.sessionId}`);

    const m = this.manuscripts.bySession(p.sessionId);
    if (!m || !m.submittedAt || !this.config.autoAdvance) return { tx };
    try {
      return { tx, advance: await this.pipeline.advance(m) };
    } catch (err) {
      // Pengikatan sudah sah; kegagalan langkah sistem berikutnya tidak membatalkannya (ulangi lewat advance).
      return { tx, advance: { error: (err as { response?: { message?: string } }).response?.message ?? (err as Error).message } };
    }
  }

  /** P03/P05/timeout: refund penuh ke alamat baru (relay `EscrowPool.refund`), lalu menghentikan sesi bila perlu. */
  async refund(p: { sessionId: Hex; recipient: Address; nullifier: Hex; proof: Hex }): Promise<{ tx: TxReceipt; closed: string[] }> {
    const e = await this.ireader.escrow(p.sessionId);
    if (e.stateValue !== EscrowState.Bound) throw new ConflictException({ error: "NOT_REFUNDABLE", message: `Escrow ${e.state}: tidak ada dana yang bisa di-refund` });
    if (!(await this.ireader.refundable(p.sessionId))) {
      throw new ConflictException({
        error: "NOT_REFUNDABLE",
        message: "Refund hanya bila naskah ditolak sebelum ada penelaah (gagal P03 atau desk reject), atau sesi macet melewati timeout tanpa keputusan",
      });
    }
    const tx = await this.chain.write("operator", "EscrowPool", "refund", [p.sessionId, p.recipient, p.nullifier, p.proof]);
    this.log.log(`APC sesi ${p.sessionId} di-refund`);
    const closed = await this.progress.closeAfterRefund(p.sessionId);
    return { tx, closed };
  }

  /** P08: klaim imbalan ke alamat baru (relay `EscrowPool.claimReward`). Pseudonim menandatangani, relayer membayar gas. */
  async claimReward(p: { sessionId: Hex; pseudonym: Address; recipient: Address; signature: Hex }): Promise<{ tx: TxReceipt; amountWei: string }> {
    const credit = await this.ireader.rewardCredit(p.sessionId, p.pseudonym);
    if (credit === 0n) throw new ConflictException({ error: "NOTHING_TO_CLAIM", message: "Tidak ada imbalan yang bisa diklaim untuk pseudonim ini di sesi tersebut" });
    const tx = await this.chain.write("operator", "EscrowPool", "claimReward", [p.sessionId, p.pseudonym, p.recipient, p.signature]);
    return { tx, amountWei: credit.toString() };
  }
}
