/**
 * Seleksi editor dan penelaah (P05-P06): kriteria, referensi undangan, referensi bukti.
 * Dipakai server (menyusun seleksi), zk-sim (memeriksa witness `ASSIGNMENT`), dan klien.
 */
import { encodeAbiParameters, keccak256, parseAbiParameters, toBytes, type Hex } from "viem";

/** Jumlah penelaah per batch (keputusan D2) dan tambahan saat zona abu-abu. */
export const REVIEWERS_PER_BATCH = 3;
export const REVIEWERS_ADDED_ON_GRAY_ZONE = 2;
export const MAX_REVIEWERS_PER_SESSION = 10;

/** Bentuk kanonik kriteria: bidang unik, terurut. Hash kriteria dihitung dari sini. */
export function canonicalCriteria(fields: readonly string[]): { fields: string[] } {
  return { fields: [...new Set(fields.map((f) => f.trim().toLowerCase()).filter(Boolean))].sort() };
}

/** `criteriaHash` yang dicatat di `ReviewerCriteriaRecorded`, `ReviewerSelectionBatchRecorded`, dan bukti ASSIGNMENT. */
export function criteriaHash(fields: readonly string[]): Hex {
  return keccak256(toBytes(JSON.stringify(canonicalCriteria(fields))));
}

/** `inviteRef` = keccak256(abi.encode(sessionId, commitment, proofRef)), seperti kode Ciko. */
export function inviteRef(sessionId: Hex, commitment: Hex, proofRef: Hex): Hex {
  return keccak256(encodeAbiParameters(parseAbiParameters("bytes32, bytes32, bytes32"), [sessionId, commitment, proofRef]));
}

/** `proofRef` on-chain = keccak256 byte JSON bukti yang diunggah ke storage publik. */
export function proofRefOf(proofJson: Uint8Array): Hex {
  return keccak256(proofJson);
}
