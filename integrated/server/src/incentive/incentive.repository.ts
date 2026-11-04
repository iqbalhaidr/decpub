/**
 * Penyimpanan insentif di SQLite: kebijakan terkunci per sesi, tingkat reputasi (q4) per pseudonim,
 * rujukan laporan QoS, dan antrian klaim reputasi per epoch.
 */
import { Injectable } from "@nestjs/common";
import { keccak256, toBytes, type Hex } from "viem";
import type { IncentivePolicy } from "@decpub/incentive-core";
import { DatabaseService, type Row } from "../db/database.service.js";

export interface LockedPolicy {
  sessionId: string;
  journalId: number;
  preset: string;
  lambda: number;
  policy: IncentivePolicy;
  /** keccak256 dari `policyJson`; dicatat on-chain saat distribusi. */
  policyHash: Hex;
  policyJson: string;
  lockedAt: string;
  lockedLate: boolean;
}

export interface ReportRef {
  sessionId: string;
  reportCid: string;
  reportHash: Hex;
  txHash: Hex;
  executedAt: string;
}

export interface QueuedClaim {
  id: number;
  reputationId: Hex;
  amount: bigint;
  nullifier: Hex;
  proof: Hex;
  queuedAt: string;
}

const policyFromRow = (r: Row): LockedPolicy => ({
  sessionId: r.session_id as string,
  journalId: r.journal_id as number,
  preset: r.preset as string,
  lambda: r.lambda as number,
  policy: JSON.parse(r.policy_json as string) as IncentivePolicy,
  policyHash: r.policy_hash as Hex,
  policyJson: r.policy_json as string,
  lockedAt: r.locked_at as string,
  lockedLate: Boolean(r.locked_late),
});

@Injectable()
export class IncentiveRepository {
  constructor(private readonly db: DatabaseService) {}

  // ---------------------------------------------------------------- kebijakan terkunci

  /** Mengunci kebijakan sesi. Tidak menimpa yang sudah terkunci (kunci pertama menang). */
  lockPolicy(p: { sessionId: string; journalId: number; policy: IncentivePolicy; late?: boolean }): LockedPolicy {
    const key = p.sessionId.toLowerCase();
    const existing = this.policyOf(key);
    if (existing) return existing;
    const policyJson = JSON.stringify(p.policy);
    this.db.run(
      `INSERT INTO session_policies (session_id, journal_id, preset, lambda, policy_json, policy_hash, locked_at, locked_late)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      key,
      p.journalId,
      p.policy.preset,
      p.policy.lambda,
      policyJson,
      keccak256(toBytes(policyJson)),
      new Date().toISOString(),
      p.late ? 1 : 0,
    );
    return this.policyOf(key)!;
  }

  policyOf(sessionId: string): LockedPolicy | undefined {
    const r = this.db.get("SELECT * FROM session_policies WHERE session_id = ?", sessionId.toLowerCase());
    return r && policyFromRow(r);
  }

  // ------------------------------------------------------------ tingkat reputasi (q4)

  /** Mencatat tingkat satu pseudonim. Mengembalikan false bila sudah ada (satu pernyataan per pseudonim). */
  recordTier(sessionId: string, pseudonym: string, tier: number): boolean {
    return (
      this.db.run(
        "INSERT INTO reputation_tiers (session_id, pseudonym, tier, recorded_at) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING",
        sessionId.toLowerCase(),
        pseudonym.toLowerCase(),
        tier,
        new Date().toISOString(),
      ).changes === 1
    );
  }

  tierOf(sessionId: string, pseudonym: string): number | undefined {
    const r = this.db.get("SELECT tier FROM reputation_tiers WHERE session_id = ? AND pseudonym = ?", sessionId.toLowerCase(), pseudonym.toLowerCase());
    return r ? (r.tier as number) : undefined;
  }

  // ----------------------------------------------------------------- laporan QoS

  saveReport(r: ReportRef): void {
    this.db.run(
      `INSERT INTO incentive_reports (session_id, report_cid, report_hash, tx_hash, executed_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO NOTHING`,
      r.sessionId.toLowerCase(),
      r.reportCid,
      r.reportHash,
      r.txHash,
      r.executedAt,
    );
  }

  reportOf(sessionId: string): ReportRef | undefined {
    const r = this.db.get("SELECT * FROM incentive_reports WHERE session_id = ?", sessionId.toLowerCase());
    return (
      r && {
        sessionId: r.session_id as string,
        reportCid: r.report_cid as string,
        reportHash: r.report_hash as Hex,
        txHash: r.tx_hash as Hex,
        executedAt: r.executed_at as string,
      }
    );
  }

  // ---------------------------------------------------------- antrian klaim reputasi

  /** Mengantrikan klaim. False bila nullifier sudah ada di antrian. */
  queueClaim(c: { reputationId: Hex; amount: bigint; nullifier: Hex; proof: Hex }): boolean {
    return (
      this.db.run(
        `INSERT INTO reputation_claim_queue (reputation_id, amount, nullifier, proof, queued_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(nullifier) DO NOTHING`,
        c.reputationId,
        c.amount.toString(),
        c.nullifier.toLowerCase(),
        c.proof,
        new Date().toISOString(),
      ).changes === 1
    );
  }

  pendingClaims(): QueuedClaim[] {
    return this.db
      .all("SELECT * FROM reputation_claim_queue WHERE minted_at IS NULL ORDER BY id")
      .map((r) => ({
        id: r.id as number,
        reputationId: r.reputation_id as Hex,
        amount: BigInt(r.amount as string),
        nullifier: r.nullifier as Hex,
        proof: r.proof as Hex,
        queuedAt: r.queued_at as string,
      }));
  }

  markMinted(ids: number[], txHash: Hex): void {
    const at = new Date().toISOString();
    this.db.transaction(() => {
      for (const id of ids) this.db.run("UPDATE reputation_claim_queue SET minted_tx = ?, minted_at = ? WHERE id = ?", txHash, at, id);
    });
  }

  /** Klaim yang tidak mungkin diterima chain lagi (mis. nullifier sudah dipakai di luar antrian): dibuang. */
  dropClaim(id: number): void {
    this.db.run("DELETE FROM reputation_claim_queue WHERE id = ?", id);
  }
}
