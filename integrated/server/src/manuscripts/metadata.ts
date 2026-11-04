/**
 * Komitmen metadata naskah asli (P02). Arsitektur bagian 5.2: `metadataHash` diberi salt.
 *
 * Kode Ciko menghitung `keccak256(JSON.stringify({title, authorName, authorEmail, ...}))`
 * (`manuscript.util.ts`). Tanpa salt, siapa pun yang menebak nama dan surel penulis bisa
 * mencocokkan hash yang tercatat on-chain. Dengan salt acak 32 byte yang hanya ada di storage
 * privat, hash menjadi komitmen yang menyembunyikan (hiding) dan tetap bisa dibuka saat
 * selective disclosure (M8): salt dan metadata dibuka, pemeriksa menghitung ulang hash.
 */
import { keccak256, toBytes, type Hex } from "viem";

export interface MetadataRecord {
  title: string;
  abstract: string;
  keywords: string[];
  journalId: number;
  authorName: string;
  authorEmail: string;
  affiliation: string;
  originalFileName: string;
  originalFileSize: number;
  /** Salt acak 32 byte, hanya di storage privat. */
  salt: Hex;
}

/** Urutan kunci tetap, supaya hash stabil. */
export function canonicalMetadata(m: MetadataRecord): string {
  return JSON.stringify([
    "decpub.metadata.v1",
    m.salt,
    m.title,
    m.abstract,
    m.keywords,
    m.journalId,
    m.authorName,
    m.authorEmail,
    m.affiliation,
    m.originalFileName,
    m.originalFileSize,
  ]);
}

export function metadataCommitment(m: MetadataRecord): Hex {
  return keccak256(toBytes(canonicalMetadata(m)));
}
