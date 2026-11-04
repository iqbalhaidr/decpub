/**
 * Bukti ZK [SIMULASI]: bentuk bukti, pembuatan sinyal publik, dan klien `zk-sim`.
 *
 * `ZkProver` adalah antarmuka yang dipakai frontend dan skrip. Pada implementasi nyata ia
 * berjalan di browser (snarkjs) dan witness tidak pernah meninggalkan klien. Pada simulasi,
 * `HttpZkProver` mengirim witness ke `zk-sim`, yang memeriksanya lalu menandatangani.
 * Untuk mengganti: implementasikan `ZkProver` baru dan pasang verifier nyata lewat
 * `ActionGateway.setVerifier`.
 */
import {
  concatHex,
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  pad,
  toBytes,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { signMessage } from "viem/accounts";
import type { RoleValue } from "./identity.js";

/** Sama dengan `IZkVerifier.Kind`. */
export const ZkKind = {
  Ephemeral: 1,
  Assignment: 2,
  AssignmentOwnership: 3,
  NoteBind: 4,
  NoteRefund: 5,
  ReputationBucket: 6,
  ReputationClaim: 7,
  SelectiveDisclosure: 8,
} as const;
export type ZkKindValue = (typeof ZkKind)[keyof typeof ZkKind];

export type ZkProof = {
  scheme: "simulated" | (string & {});
  kind: ZkKindValue;
  publicSignals: Hex[];
  proof: Hex;
};

export interface ZkProver {
  prove(kind: ZkKindValue, witness: unknown, publicSignals: Hex[]): Promise<ZkProof>;
}

/** Tag domain tanda tangan attestor. Sama dengan `SimulatedZkVerifier.PROOF_DOMAIN`. */
export const PROOF_DOMAIN: Hex = keccak256(toBytes("decpub.zk.simulated.v1"));

/**
 * Digest yang ditandatangani attestor. Sama dengan `SimulatedZkVerifier.proofDigest`:
 * keccak256(abi.encode(PROOF_DOMAIN, chainId, verifier, kind, keccak256(packed signals))).
 */
export function proofDigest(
  chainId: number | bigint,
  verifier: Address,
  kind: ZkKindValue,
  publicSignals: readonly Hex[],
): Hex {
  const signalsHash = keccak256(publicSignals.length ? concatHex([...publicSignals]) : "0x");
  return keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, uint256, address, uint8, bytes32"), [
      PROOF_DOMAIN,
      BigInt(chainId),
      verifier,
      kind,
      signalsHash,
    ]),
  );
}

const word = (n: number | bigint): Hex => toHex(BigInt(n), { size: 32 });
const addrWord = (a: Address): Hex => pad(a, { size: 32 });

/** Sinyal publik per jenis. Urutan sama dengan `ActionGateway`. */
export const signals = {
  /** [sessionId, role, pseudonym, sessionCommitment, nullifier] */
  ephemeral: (sessionId: Hex, role: RoleValue, pseudonym: Address, sessionCommitment: Hex, nullifier: Hex): Hex[] => [
    sessionId,
    word(role),
    addrWord(pseudonym),
    sessionCommitment,
    nullifier,
  ],
  /** [sessionId, criteriaHash, assignmentCommitment] */
  assignment: (sessionId: Hex, criteriaHash: Hex, commitment: Hex): Hex[] => [sessionId, criteriaHash, commitment],
  /** [sessionId, assignmentCommitment, pseudonym] */
  assignmentOwnership: (sessionId: Hex, commitment: Hex, pseudonym: Address): Hex[] => [
    sessionId,
    commitment,
    addrWord(pseudonym),
  ],
  /** [sessionId, nullifier]. `EscrowPool.bindNote`. */
  noteBind: (sessionId: Hex, nullifier: Hex): Hex[] => [sessionId, nullifier],
  /** [sessionId, recipient, nullifier]. `EscrowPool.refund`. */
  noteRefund: (sessionId: Hex, recipient: Address, nullifier: Hex): Hex[] => [
    sessionId,
    addrWord(recipient),
    nullifier,
  ],
  /** [sessionId, pseudonym, tier, nullifier]. Pernyataan tingkat reputasi (q4) untuk pseudonim penelaah. */
  reputationBucket: (sessionId: Hex, pseudonym: Address, tier: number, nullifier: Hex): Hex[] => [
    sessionId,
    addrWord(pseudonym),
    word(tier),
    nullifier,
  ],
  /** [reputationId, amount, nullifier]. `ReputationSBT.claimReputation`. */
  reputationClaim: (reputationId: Hex, amount: bigint, nullifier: Hex): Hex[] => [
    reputationId,
    word(amount),
    nullifier,
  ],
};

/** Kesalahan dari `zk-sim`. `code` stabil (dipakai tes), `message` tidak memuat witness. */
export class ZkProveError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ZkProveError";
  }
}

export class HttpZkProver implements ZkProver {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 10_000,
  ) {}

  async prove(kind: ZkKindValue, witness: unknown, publicSignals: Hex[]): Promise<ZkProof> {
    const res = await fetch(`${this.baseUrl.replace(/\/+$/, "")}/prove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, witness, publicSignals }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new ZkProveError(String(body.error ?? "ERROR"), String(body.message ?? res.statusText), res.status);
    }
    return body as unknown as ZkProof;
  }
}

export function zkUrlFromEnv(env: Record<string, string | undefined> = process.env): string {
  return (env.ZK_SIM_URL ?? "http://127.0.0.1:8082").replace(/\/+$/, "");
}

/**
 * Menandatangani bukti simulasi sebagai attestor. Dipakai `zk-sim` (setelah memeriksa
 * witness) dan tes kontrak. Jangan dipanggil dari kode klien biasa: kunci attestor
 * adalah kepercayaan simulasi ini.
 */
export async function signProof(
  attestorPrivateKey: Hex,
  chainId: number | bigint,
  verifier: Address,
  kind: ZkKindValue,
  publicSignals: Hex[],
): Promise<ZkProof> {
  const proof = await signMessage({
    privateKey: attestorPrivateKey,
    message: { raw: proofDigest(chainId, verifier, kind, publicSignals) },
  });
  return { scheme: "simulated", kind, publicSignals, proof };
}
