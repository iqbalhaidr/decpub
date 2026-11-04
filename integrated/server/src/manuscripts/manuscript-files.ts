/** Lokasi berkas naskah di storage privat. Satu tempat supaya layanan tidak saling menebak nama. */
import { PrivateStore } from "../storage/private-store.js";
import type { MetadataRecord } from "./metadata.js";

/** Revisi 0 = pengajuan awal (lokasi lama, tidak berubah); revisi n >= 1 di bawah `rev<n>/`. */
const base = (id: string, revision: number) => (revision === 0 ? `manuscripts/${id}` : `manuscripts/${id}/rev${revision}`);

export const refs = {
  original: (id: string, revision = 0) => `${base(id, revision)}/original.pdf`,
  /** Naskah anonim yang sudah dihitung di P02 tetapi belum diunggah ke storage publik (P04). */
  anonymizedStaging: (id: string, revision = 0) => `${base(id, revision)}/anonymized.pdf`,
  /** Metadata publik (anonim) yang menunggu diunggah di P04. */
  publicMetadataStaging: (id: string, revision = 0) => `${base(id, revision)}/public-metadata.json`,
  /** Identitas penulis dan salt komitmen. Tidak pernah keluar dari storage privat. */
  identity: (id: string, revision = 0) => `${base(id, revision)}/identity.json`,
};

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function putJson(store: PrivateStore, ref: string, value: unknown): Promise<void> {
  await store.put(ref, enc.encode(JSON.stringify(value)));
}

export async function getJson<T>(store: PrivateStore, ref: string): Promise<T> {
  return JSON.parse(dec.decode(await store.get(ref))) as T;
}

export type IdentityRecord = MetadataRecord;
