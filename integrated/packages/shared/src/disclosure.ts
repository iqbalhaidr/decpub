/**
 * Selective disclosure (P08, keputusan B2): penulis (atau editor, opsional) memilih atribut identitas
 * yang dibuka setelah artikel terbit. Hanya atribut terpilih yang masuk hash; sisanya `null` sehingga
 * tidak ikut terungkap bahkan lewat salt yang dipublikasikan.
 *
 * Bukti `SELECTIVE_DISCLOSURE` [SIMULASI] membuktikan: akun permanen `permanentAccount` dimiliki orang
 * yang memegang secret pembuat pseudonim sesi, dan `attributesHash` dihitung dari atribut + salt yang
 * ia ketahui. Kebenaran atribut terhadap data yang diajukan diperiksa server (tepercaya, lihat
 * docs/arsitektur.md bagian 8.2), bukan oleh bukti.
 *
 * Penelaah tidak punya jalur pengungkapan: peran yang diterima hanya Author dan Editor.
 */
import { keccak256, toBytes, type Address, type Hex } from "viem";
import { Role, type RoleValue } from "./identity.js";

/** Peran yang boleh membuka identitas. Penelaah tidak pernah. */
export const DISCLOSABLE_ROLES = [Role.Author, Role.Editor] as const;
export type DisclosableRole = (typeof DISCLOSABLE_ROLES)[number];

export function isDisclosableRole(v: unknown): v is DisclosableRole {
  return v === Role.Author || v === Role.Editor;
}

export const DISCLOSABLE_ATTRIBUTES = ["name", "affiliation", "email"] as const;
export type DisclosableAttribute = (typeof DISCLOSABLE_ATTRIBUTES)[number];

/** Atribut yang dibuka. Kunci yang tidak ada (atau `undefined`) berarti tidak dibuka. */
export type DisclosureAttributes = Partial<Record<DisclosableAttribute, string>>;

/** Hanya kunci yang dikenal dan bernilai string tak kosong; selebihnya dibuang. */
export function normalizeAttributes(a: DisclosureAttributes): DisclosureAttributes {
  const out: DisclosureAttributes = {};
  for (const k of DISCLOSABLE_ATTRIBUTES) {
    const v = a[k];
    if (typeof v === "string" && v.length > 0) out[k] = v;
  }
  return out;
}

/** keccak256 dari daftar kanonik; urutan tetap, atribut tak dibuka = null. */
export function attributesHash(sessionId: Hex, role: DisclosableRole, attributes: DisclosureAttributes, salt: Hex): Hex {
  const a = normalizeAttributes(attributes);
  return keccak256(
    toBytes(
      JSON.stringify([
        "decpub.disclosure.v1",
        sessionId.toLowerCase(),
        role,
        salt.toLowerCase(),
        a.name ?? null,
        a.affiliation ?? null,
        a.email ?? null,
      ]),
    ),
  );
}

/** Sinyal publik bukti pengungkapan: [sessionId, pseudonym, permanentAccount, attributesHash]. Sama dengan `PublicationRecords`. */
export function disclosureSignals(sessionId: Hex, pseudonym: Address, permanentAccount: Address, hash: Hex): Hex[] {
  const addrWord = (a: Address): Hex => `0x${"0".repeat(24)}${a.slice(2).toLowerCase()}`;
  return [sessionId, addrWord(pseudonym), addrWord(permanentAccount), hash];
}

export type { RoleValue };
