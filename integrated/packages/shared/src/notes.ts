/**
 * Note APC, klaim imbalan, dan klaim reputasi (M6, docs/arsitektur.md bagian 6).
 *
 * Note = pool nominal tetap di `EscrowPool`. Rahasia note dibuat dan disimpan di sisi penulis
 * (browser), tidak pernah ke server. Dari rahasia itu diturunkan:
 *   noteCommitment      = H(rahasia)                 disetor on-chain (`deposit`)
 *   bindNullifier       = H(rahasia, "bind")         dipakai saat `bindNote` (satu note, satu sesi)
 *   refundNullifier     = H(rahasia, sesi, "refund") dipakai saat `refund`
 * Hash berdomain (`tagged`) seperti di `identity.ts`, sehingga satu nilai tidak bisa dipakai di
 * konteks lain. Kunci imbalan penelaah adalah kunci pseudonim sesi (`identity.ts`).
 */
import { encodeAbiParameters, keccak256, parseAbiParameters, toBytes, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const tag = (name: string): Hex => keccak256(toBytes(name));

function tagged(name: string, types: string, values: readonly unknown[]): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters(`bytes32, ${types}`), [tag(name), ...values] as never));
}

/** Rahasia note 32 byte acak. Simpan hanya di sisi penulis. */
export function generateNoteSecret(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return toHex(b);
}

export function noteCommitment(noteSecret: Hex): Hex {
  return tagged("decpub.note.v1", "bytes32", [noteSecret]);
}

export function noteBindNullifier(noteSecret: Hex): Hex {
  return tagged("decpub.note-bind.v1", "bytes32", [noteSecret]);
}

export function noteRefundNullifier(noteSecret: Hex, sessionId: Hex): Hex {
  return tagged("decpub.note-refund.v1", "bytes32, bytes32", [noteSecret, sessionId]);
}

// ------------------------------------------------------- klaim imbalan (EIP-712)

/** Domain `EscrowPool` (EIP712("DecPubEscrowPool", "1")). */
export function escrowDomain(chainId: number | bigint, escrowPool: Address) {
  return { name: "DecPubEscrowPool", version: "1", chainId: Number(chainId), verifyingContract: escrowPool } as const;
}

export const CLAIM_REWARD_TYPES = {
  ClaimReward: [
    { name: "sessionId", type: "bytes32" },
    { name: "pseudonym", type: "address" },
    { name: "recipient", type: "address" },
  ],
} as const;

/**
 * Tanda tangan pseudonim penelaah untuk `EscrowPool.claimReward`. `recipient` terikat pada
 * tanda tangan, sehingga relayer yang mengirim tidak bisa mengalihkan imbalan.
 */
export async function signClaimReward(
  s: { privateKey: Hex; chainId: number | bigint; escrowPool: Address },
  m: { sessionId: Hex; recipient: Address },
): Promise<Hex> {
  const account = privateKeyToAccount(s.privateKey);
  return account.signTypedData({
    domain: escrowDomain(s.chainId, s.escrowPool),
    types: CLAIM_REWARD_TYPES,
    primaryType: "ClaimReward",
    message: { sessionId: m.sessionId, pseudonym: account.address, recipient: m.recipient },
  });
}

// ------------------------------------------------------------- klaim reputasi

/** Kelipatan jumlah klaim reputasi (0,25), sama dengan `ReputationSBT.claimStep` bawaan. */
export const REPUTATION_CLAIM_STEP = 25n * 10n ** 16n;

/** Nullifier klaim reputasi satu pseudonim sesi: satu kredit hanya bisa diklaim sekali. */
export function reputationClaimNullifier(secret: Hex, sessionId: Hex, slot = 0): Hex {
  return tagged("decpub.reputation-claim.v1", "bytes32, bytes32, uint32", [secret, sessionId, slot]);
}
