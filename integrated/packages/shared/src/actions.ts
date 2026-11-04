/**
 * Aksi bertanda tangan pseudonim (EIP-712) untuk `ActionGateway`, dan hash commit telaah.
 * Tipe dan nama field harus sama persis dengan struct dan typehash di `ActionGateway.sol`.
 * Domain: chainId dan alamat gateway diambil dari konfigurasi (env), tidak ditulis mati
 * (di Roihan `wallet.ts` chainId tertanam di 7 titik).
 */
import {
  encodeAbiParameters,
  keccak256,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export function gatewayDomain(chainId: number | bigint, gateway: Address) {
  return {
    name: "DecPubActionGateway",
    version: "1",
    chainId: Number(chainId),
    verifyingContract: gateway,
  } as const;
}

export const ACTION_TYPES = {
  CreateSession: [
    { name: "sessionId", type: "bytes32" },
    { name: "pseudonym", type: "address" },
    { name: "originalManuscriptHash", type: "bytes32" },
    { name: "anonymizedManuscriptHash", type: "bytes32" },
    { name: "metadataHash", type: "bytes32" },
    { name: "anonymizedManuscriptURI", type: "string" },
    { name: "metadataURI", type: "string" },
    { name: "nonce", type: "uint256" },
  ],
  RecordRevision: [
    { name: "sessionId", type: "bytes32" },
    { name: "pseudonym", type: "address" },
    { name: "newOriginalManuscriptHash", type: "bytes32" },
    { name: "newAnonymizedManuscriptHash", type: "bytes32" },
    { name: "newMetadataHash", type: "bytes32" },
    { name: "newAnonymizedManuscriptURI", type: "string" },
    { name: "newMetadataURI", type: "string" },
    { name: "nonce", type: "uint256" },
  ],
  Screening: [
    { name: "sessionId", type: "bytes32" },
    { name: "pseudonym", type: "address" },
    { name: "editorialReportHash", type: "bytes32" },
    { name: "anonymousEditorialReportHash", type: "bytes32" },
    { name: "anonymousEditorialReportURI", type: "string" },
    { name: "decision", type: "uint8" },
    { name: "nonce", type: "uint256" },
  ],
  CommitReview: [
    { name: "sessionId", type: "bytes32" },
    { name: "pseudonym", type: "address" },
    { name: "assignmentCommitment", type: "bytes32" },
    { name: "commitHash", type: "bytes32" },
    { name: "nonce", type: "uint256" },
  ],
  RevealReview: [
    { name: "sessionId", type: "bytes32" },
    { name: "pseudonym", type: "address" },
    { name: "assignmentCommitment", type: "bytes32" },
    { name: "recommendation", type: "uint8" },
    { name: "reviewHash", type: "bytes32" },
    { name: "reviewURI", type: "string" },
    { name: "reviewNonce", type: "bytes32" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export type ActionName = keyof typeof ACTION_TYPES;

export type CreateSessionAction = {
  sessionId: Hex;
  pseudonym: Address;
  originalManuscriptHash: Hex;
  anonymizedManuscriptHash: Hex;
  metadataHash: Hex;
  anonymizedManuscriptURI: string;
  metadataURI: string;
  nonce: bigint;
};
export type RevisionAction = {
  sessionId: Hex;
  pseudonym: Address;
  newOriginalManuscriptHash: Hex;
  newAnonymizedManuscriptHash: Hex;
  newMetadataHash: Hex;
  newAnonymizedManuscriptURI: string;
  newMetadataURI: string;
  nonce: bigint;
};
export type ScreeningAction = {
  sessionId: Hex;
  pseudonym: Address;
  editorialReportHash: Hex;
  anonymousEditorialReportHash: Hex;
  anonymousEditorialReportURI: string;
  decision: number;
  nonce: bigint;
};
export type CommitAction = {
  sessionId: Hex;
  pseudonym: Address;
  assignmentCommitment: Hex;
  commitHash: Hex;
  nonce: bigint;
};
export type RevealAction = {
  sessionId: Hex;
  pseudonym: Address;
  assignmentCommitment: Hex;
  recommendation: number;
  reviewHash: Hex;
  reviewURI: string;
  reviewNonce: Hex;
  nonce: bigint;
};

type Signer = { privateKey: Hex; chainId: number | bigint; gateway: Address };

async function sign<K extends ActionName>(s: Signer, primaryType: K, message: Record<string, unknown>): Promise<Hex> {
  const account = privateKeyToAccount(s.privateKey);
  if ((message as { pseudonym: Address }).pseudonym.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error("Field pseudonym harus sama dengan alamat penanda tangan");
  }
  return account.signTypedData({
    domain: gatewayDomain(s.chainId, s.gateway),
    types: { [primaryType]: ACTION_TYPES[primaryType] },
    primaryType,
    message,
  } as never);
}

export const signCreateSession = (s: Signer, a: CreateSessionAction) => sign(s, "CreateSession", a);
export const signRevision = (s: Signer, a: RevisionAction) => sign(s, "RecordRevision", a);
export const signScreening = (s: Signer, a: ScreeningAction) => sign(s, "Screening", a);
export const signCommit = (s: Signer, a: CommitAction) => sign(s, "CommitReview", a);
export const signReveal = (s: Signer, a: RevealAction) => sign(s, "RevealReview", a);

/** Sama dengan `ReviewRecommendation` di `IReviewSubmissions`. */
export const Recommendation = { Reject: 1, MajorRevision: 2, MinorRevision: 3, AcceptAsIs: 4 } as const;
export type RecommendationValue = (typeof Recommendation)[keyof typeof Recommendation];

/**
 * Hash commit telaah, dihitung di klien sehingga server tidak melihat rekomendasi sebelum
 * reveal. Sama dengan `ReviewSubmissions.computeCommitHash`:
 * keccak256(abi.encode(sessionId, pseudonym, recommendation, reviewHash, reviewURI, nonce)).
 */
export function computeCommitHash(p: {
  sessionId: Hex;
  pseudonym: Address;
  recommendation: RecommendationValue;
  reviewHash: Hex;
  reviewURI: string;
  nonce: Hex;
}): Hex {
  return keccak256(
    encodeAbiParameters(parseAbiParameters("bytes32, address, uint8, bytes32, string, bytes32"), [
      p.sessionId,
      p.pseudonym,
      p.recommendation,
      p.reviewHash,
      p.reviewURI,
      p.nonce,
    ]),
  );
}
