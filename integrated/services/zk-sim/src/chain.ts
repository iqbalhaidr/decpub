/** Pembaca keadaan on-chain untuk zk-sim, lewat RPC (viem). */
import { createPublicClient, http, type Address, type Hex } from "viem";
import { EscrowPoolAbi, PermanentAccountsAbi } from "@decpub/shared";
import type { ChainReader } from "./checks.js";

/**
 * `escrowPool` opsional: tanpanya jenis NOTE_BIND dan NOTE_REFUND menjawab 501
 * (`ESCROW_NOT_CONFIGURED`), sehingga zk-sim tetap bisa dipakai pada deployment M2-M5.
 */
export function rpcChainReader(rpcUrl: string, permanentAccounts: Address, escrowPool?: Address): ChainReader {
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
  return reader;
}
