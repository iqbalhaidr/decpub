/**
 * Pembaca keadaan escrow, distribusi, dan reputasi on-chain (kontrak Hugo hasil M6). Hanya baca.
 * Status dari chain adalah sumber kebenaran; server tidak menyimpan salinan dana.
 */
import { Injectable } from "@nestjs/common";
import type { Address, Hex } from "viem";
import { ChainService } from "./chain.service.js";

/** `EscrowPool.EscrowState`. */
export const EscrowState = { None: 0, Bound: 1, Credited: 2, Refunded: 3 } as const;
export const ESCROW_STATE_NAMES = ["None", "Bound", "Credited", "Refunded"] as const;

export interface EscrowView {
  stateValue: number;
  state: string;
  amount: bigint;
  boundAt: number;
  /** Imbalan yang sudah dikreditkan tetapi belum diklaim penelaah. */
  unclaimed: bigint;
}

export interface DistributionView {
  executed: boolean;
  reviewerCount: number;
  executedAt: number;
  qosReportHash: Hex;
  policyHash: Hex;
}

@Injectable()
export class IncentiveReader {
  constructor(private readonly chain: ChainService) {}

  async escrow(sessionId: Hex): Promise<EscrowView> {
    const e = await this.chain.read<readonly [number, bigint, Hex, bigint, bigint]>("EscrowPool", "escrows", [sessionId]);
    return {
      stateValue: Number(e[0]),
      state: ESCROW_STATE_NAMES[Number(e[0])] ?? "Unknown",
      amount: e[1],
      boundAt: Number(e[3]),
      unclaimed: e[4],
    };
  }

  refundable(sessionId: Hex): Promise<boolean> {
    return this.chain.read<boolean>("EscrowPool", "refundable", [sessionId]);
  }

  distributable(sessionId: Hex): Promise<boolean> {
    return this.chain.read<boolean>("EscrowPool", "distributable", [sessionId]);
  }

  rewardCredit(sessionId: Hex, pseudonym: Address): Promise<bigint> {
    return this.chain.read<bigint>("EscrowPool", "rewardCredit", [sessionId, pseudonym]);
  }

  apcAmount(): Promise<bigint> {
    return this.chain.read<bigint>("EscrowPool", "apcAmount");
  }

  async distribution(sessionId: Hex): Promise<DistributionView> {
    const d = await this.chain.read<readonly [boolean, number, bigint, Hex, Hex]>("IncentiveEngine", "distributions", [sessionId]);
    return { executed: Boolean(d[0]), reviewerCount: Number(d[1]), executedAt: Number(d[2]), qosReportHash: d[3], policyHash: d[4] };
  }

  effectiveBalance(reputationId: Hex): Promise<bigint> {
    return this.chain.read<bigint>("ReputationSBT", "effectiveBalance", [reputationId]);
  }

  reputationNullifierUsed(nullifier: Hex): Promise<boolean> {
    return this.chain.read<boolean>("ReputationSBT", "nullifierUsed", [nullifier]);
  }

  reputationClaimStep(): Promise<bigint> {
    return this.chain.read<bigint>("ReputationSBT", "claimStep");
  }

  unclaimedReputationPool(): Promise<bigint> {
    return this.chain.read<bigint>("ReputationSBT", "unclaimedPool");
  }
}
