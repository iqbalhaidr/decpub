/**
 * Reputasi (A1, arsitektur bagian 6.4), sisi server.
 *
 *  recordTier : penelaah menyatakan tingkat q4 untuk pseudonim barunya dengan bukti REPUTATION_BUCKET.
 *               Server menyimpan (sesi, pseudonim, tingkat) dan TIDAK menerima reputationId.
 *  queueClaim : penelaah mengajukan klaim mint dengan bukti REPUTATION_CLAIM. Klaim membawa reputationId, jumlah,
 *               dan nullifier, TANPA sesi dan pseudonim, sehingga transaksi mint tidak tertaut ke naskah.
 *  flushEpoch : admin memicu epoch; klaim yang menunggu diacak urutannya dan dikirim berkelompok dalam transaksi
 *               `claimReputation` sehingga urutan dan waktu mint tidak mengikuti urutan penyelesaian sesi.
 */
import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Hex } from "viem";
import { ZkKind, signals } from "@decpub/shared";
import { ChainService } from "../chain/chain.service.js";
import { IncentiveReader } from "../chain/incentive-reader.service.js";
import { SessionReader } from "../chain/session-reader.service.js";
import { SHUFFLE, type Shuffle } from "../selection/selection.service.js";
import { IncentiveRepository, type QueuedClaim } from "./incentive.repository.js";

/** Jumlah klaim per transaksi mint. */
export const MINT_CHUNK = 20;

@Injectable()
export class ReputationService {
  private readonly log = new Logger(ReputationService.name);

  constructor(
    private readonly chain: ChainService,
    private readonly reader: SessionReader,
    private readonly ireader: IncentiveReader,
    private readonly repo: IncentiveRepository,
    @Inject(SHUFFLE) private readonly shuffle: Shuffle,
  ) {}

  async recordTier(p: { sessionId: Hex; pseudonym: Hex; tier: number; nullifier: Hex; proof: Hex }) {
    const eph = await this.reader.ephemeral(p.pseudonym as `0x${string}`);
    if (!eph.exists || eph.revoked || eph.role !== "Reviewer" || eph.sessionId.toLowerCase() !== p.sessionId.toLowerCase()) {
      throw new BadRequestException("Pseudonim bukan Reviewer yang terdaftar untuk sesi ini");
    }
    if ((await this.ireader.distribution(p.sessionId)).executed) {
      throw new ConflictException("Imbalan sesi ini sudah didistribusikan; tingkat tidak bisa lagi dinyatakan");
    }
    const sig = signals.reputationBucket(p.sessionId, p.pseudonym as `0x${string}`, p.tier, p.nullifier);
    if (!(await this.reader.verifyProof(ZkKind.ReputationBucket, sig, p.proof))) {
      throw new BadRequestException({ error: "INVALID_PROOF", message: "Bukti tingkat reputasi tidak sah" });
    }
    if (!this.repo.recordTier(p.sessionId, p.pseudonym, p.tier)) {
      throw new ConflictException({ error: "TIER_ALREADY_RECORDED", message: "Pseudonim ini sudah menyatakan tingkat reputasinya" });
    }
    return { sessionId: p.sessionId, pseudonym: p.pseudonym, tier: p.tier, q4: p.tier / 4 };
  }

  async queueClaim(p: { reputationId: Hex; amount: bigint; nullifier: Hex; proof: Hex }) {
    const step = await this.ireader.reputationClaimStep();
    if (p.amount === 0n || p.amount % step !== 0n) throw new BadRequestException(`Jumlah harus kelipatan ${step} (0,25)`);
    const sig = signals.reputationClaim(p.reputationId, p.amount, p.nullifier);
    if (!(await this.reader.verifyProof(ZkKind.ReputationClaim, sig, p.proof))) {
      throw new BadRequestException({ error: "INVALID_PROOF", message: "Bukti klaim reputasi tidak sah" });
    }
    if (await this.ireader.reputationNullifierUsed(p.nullifier)) {
      throw new ConflictException({ error: "ALREADY_CLAIMED", message: "Kredit ini sudah diklaim" });
    }
    if (!this.repo.queueClaim(p)) throw new ConflictException({ error: "ALREADY_QUEUED", message: "Klaim ini sudah ada di antrian" });
    return { queued: true, pending: this.repo.pendingClaims().length };
  }

  pending(): { pending: number } {
    return { pending: this.repo.pendingClaims().length };
  }

  /** Mengirim semua klaim yang menunggu: diacak, lalu per kelompok `MINT_CHUNK`. Klaim yang ditolak chain dilaporkan. */
  async flushEpoch(): Promise<{ minted: number; transactions: Hex[]; rejected: Array<{ nullifier: Hex; reason: string }> }> {
    const queue = this.shuffle(this.repo.pendingClaims());
    if (queue.length === 0) throw new NotFoundException("Tidak ada klaim reputasi yang menunggu");
    const transactions: Hex[] = [];
    const rejected: Array<{ nullifier: Hex; reason: string }> = [];
    let minted = 0;

    const send = async (claims: QueuedClaim[]) => {
      const tx = await this.chain.write("operator", "ReputationSBT", "claimReputation", [
        claims.map((c) => ({ reputationId: c.reputationId, amount: c.amount, nullifier: c.nullifier, proof: c.proof })),
      ]);
      this.repo.markMinted(claims.map((c) => c.id), tx.txHash);
      transactions.push(tx.txHash);
      minted += claims.length;
    };

    for (let i = 0; i < queue.length; i += MINT_CHUNK) {
      const chunk = queue.slice(i, i + MINT_CHUNK);
      try {
        await send(chunk);
      } catch {
        // Satu klaim buruk menggagalkan seluruh kelompok: coba satu per satu, buang yang ditolak chain.
        for (const c of chunk) {
          try {
            await send([c]);
          } catch (e) {
            const reason = (e as { response?: { revert?: string; message?: string } }).response?.revert ?? (e as Error).message;
            rejected.push({ nullifier: c.nullifier, reason });
            this.repo.dropClaim(c.id);
          }
        }
      }
    }
    this.log.log(`Epoch reputasi: ${minted} klaim dimint dalam ${transactions.length} transaksi, ${rejected.length} ditolak`);
    return { minted, transactions, rejected };
  }
}
