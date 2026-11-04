/** Pembaca keadaan on-chain untuk zk-sim, lewat RPC (viem). */
import { createPublicClient, http, type Address, type Hex } from "viem";
import { PermanentAccountsAbi } from "@decpub/shared";
import type { ChainReader } from "./checks.js";

export function rpcChainReader(rpcUrl: string, permanentAccounts: Address): ChainReader {
  const client = createPublicClient({ transport: http(rpcUrl) });
  return {
    isIdentityRegistered: (commitment: Hex) =>
      client.readContract({
        address: permanentAccounts,
        abi: PermanentAccountsAbi,
        functionName: "isCommitmentUsed",
        args: [commitment],
      }),
  };
}
