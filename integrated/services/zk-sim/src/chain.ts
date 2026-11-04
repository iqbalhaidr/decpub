/** Pembaca keadaan on-chain untuk zk-sim, lewat RPC (viem). */
import { createPublicClient, http, type Address, type Hex } from "viem";
import { EscrowPoolAbi, IncentiveEngineAbi, PermanentAccountsAbi, PublicationSessionsAbi, ReputationSBTAbi } from "@decpub/shared";
import type { ChainReader } from "./checks.js";

/**
 * `escrowPool` opsional: tanpanya jenis NOTE_BIND dan NOTE_REFUND menjawab 501
 * (`ESCROW_NOT_CONFIGURED`), sehingga zk-sim tetap bisa dipakai pada deployment M2-M5.
 */
export function rpcChainReader(
  rpcUrl: string,
  permanentAccounts: Address,
  escrowPool?: Address,
  /** Opsional: tanpanya jenis REPUTATION_BUCKET dan REPUTATION_CLAIM menjawab 501 (`REPUTATION_NOT_CONFIGURED`). */
  reputation?: { reputationSbt: Address; engine: Address; fromBlock?: bigint },
  /** Opsional: tanpanya jenis SELECTIVE_DISCLOSURE menjawab 501 (`DISCLOSURE_NOT_CONFIGURED`). */
  publicationSessions?: Address,
): ChainReader {
  const client = createPublicClient({ transport: http(rpcUrl) });
  const reader: ChainReader = {
    isIdentityRegistered: (commitment: Hex) =>
      client.readContract({
        address: permanentAccounts,
        abi: PermanentAccountsAbi,
        functionName: "isCommitmentUsed",
        args: [commitment],
      }),
  };
  if (publicationSessions) {
    reader.identityCommitmentOf = async (account) => {
      const acc = await client.readContract({ address: permanentAccounts, abi: PermanentAccountsAbi, functionName: "getAccount", args: [account] }).catch(() => null);
      return acc && acc.exists ? acc.identityCommitment : null;
    };
    reader.sessionParty = async (sessionId, role) => {
      const s = await client.readContract({ address: publicationSessions, abi: PublicationSessionsAbi, functionName: "getSession", args: [sessionId] }).catch(() => null);
      if (!s || !s.exists) return null;
      const p = role === 0 ? s.authorPseudonym : s.editorPseudonym;
      return /^0x0{40}$/i.test(p) ? null : p;
    };
  }
  if (escrowPool) {
    reader.isNoteDeposited = (commitment) =>
      client.readContract({ address: escrowPool, abi: EscrowPoolAbi, functionName: "noteDeposited", args: [commitment] });
    reader.isNullifierUsed = (nullifier) =>
      client.readContract({ address: escrowPool, abi: EscrowPoolAbi, functionName: "nullifierUsed", args: [nullifier] });
    reader.escrowBindNullifier = async (sessionId) => {
      const e = await client.readContract({
        address: escrowPool,
        abi: EscrowPoolAbi,
        functionName: "escrows",
        args: [sessionId],
      });
      // [state, amount, bindNullifier, boundAt, unclaimed]; state 0 = belum terikat
      return e[0] === 0 ? null : e[2];
    };
  }
  if (reputation) {
    const { reputationSbt, engine, fromBlock = 0n } = reputation;
    reader.effectiveBalance = (id) =>
      client.readContract({ address: reputationSbt, abi: ReputationSBTAbi, functionName: "effectiveBalance", args: [id] });
    reader.isReputationNullifierUsed = (nullifier) =>
      client.readContract({ address: reputationSbt, abi: ReputationSBTAbi, functionName: "nullifierUsed", args: [nullifier] });
    reader.reputationCredit = async (sessionId, pseudonym) => {
      const event = IncentiveEngineAbi.find((i) => i.type === "event" && i.name === "RewardCredited")!;
      const logs = await client.getLogs({
        address: engine,
        event: event as never,
        args: { sessionId, pseudonym } as never,
        fromBlock,
        toBlock: "latest",
      });
      if (logs.length === 0) return null;
      // Satu distribusi per sesi, jadi paling banyak satu log per pseudonim.
      return (logs[logs.length - 1] as unknown as { args: { reputationAmount: bigint } }).args.reputationAmount;
    };
  }
  return reader;
}
