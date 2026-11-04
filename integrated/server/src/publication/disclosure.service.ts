/**
 * Selective disclosure (P08, keputusan B2): atas pilihan penulis, setelah artikel terbit, nama (dan atribut
 * lain yang dipilih) serta naskah asli dibuka. Editor boleh membuka diri secara opsional. Penelaah tidak
 * punya jalur ini (tidak ada peran 1 di DTO, kontrak, maupun pemeriksa bukti).
 *
 * Urutan penting (naskah asli tidak bisa ditarik kembali setelah masuk storage publik):
 *   1. otorisasi (JWT pemilik naskah / editor yang menerima undangan; akun permanen = akun terdaftar pengguna),
 *   2. bukti `SELECTIVE_DISCLOSURE` diperiksa di verifier on-chain (view),
 *   3. keutuhan data privat: komitmen metadata = `metadataHash` on-chain, sha256 naskah asli = `originalManuscriptHash`,
 *      dan atribut terpilih sama dengan yang diajukan,
 *   4. `PublicationRecords.recordDisclosure` dengan CID naskah asli yang dihitung (content-addressed), BARU SESUDAH itu
 *   5. berkas diunggah ke storage publik. Bila langkah 5 gagal, CID sudah tercatat dan unggahan diulang pada permintaan
 *      berikutnya; berkas tidak pernah lebih dulu publik daripada catatan on-chain-nya.
 *
 * Kebenaran atribut dijamin server (tepercaya), bukan bukti ZK: bukti hanya mengikat pemilik pseudonim ke akun permanen
 * dan ke hash atribut (docs/arsitektur.md bagian 8.2).
 */
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Address, Hex } from "viem";
import {
  PublicationStatus,
  Role,
  ZkKind,
  attributesHash,
  disclosureSignals,
  normalizeAttributes,
  type DisclosableRole,
  type DisclosureAttributes,
  type StorageProvider,
} from "@decpub/shared";
import { SessionReader } from "../chain/session-reader.service.js";
import { sha256Hex } from "../manuscripts/intake.service.js";
import { getJson, refs, type IdentityRecord } from "../manuscripts/manuscript-files.js";
import { metadataCommitment } from "../manuscripts/metadata.js";
import { ManuscriptsRepository } from "../manuscripts/manuscripts.repository.js";
import { InvitationsRepository } from "../selection/invitations.repository.js";
import { PRIVATE_STORE, type PrivateStore } from "../storage/private-store.js";
import { PUBLIC_STORAGE } from "../storage/storage.module.js";
import { UsersRepository } from "../users/users.repository.js";
import { PublicationRepository, type DisclosureRow } from "./publication.repository.js";
import { RecordsService } from "./records.service.js";

export interface DisclosureRequest {
  sessionId: Hex;
  role: DisclosableRole;
  permanentAccount: Address;
  attributes: DisclosureAttributes;
  salt: Hex;
  /** Hanya penulis: ikut membuka naskah asli. */
  includeManuscript: boolean;
  proof: Hex;
}

export interface DisclosureResult {
  sessionId: Hex;
  role: DisclosableRole;
  attributes: DisclosureAttributes;
  attributesHash: Hex;
  txHash: string;
  originalManuscript: { cid: string; sha256: Hex; uploaded: boolean } | null;
}

@Injectable()
export class DisclosureService {
  constructor(
    private readonly reader: SessionReader,
    private readonly records: RecordsService,
    private readonly repo: PublicationRepository,
    private readonly manuscripts: ManuscriptsRepository,
    private readonly invitations: InvitationsRepository,
    private readonly users: UsersRepository,
    @Inject(PRIVATE_STORE) private readonly privateStore: PrivateStore,
    @Inject(PUBLIC_STORAGE) private readonly storage: StorageProvider,
  ) {}

  async disclose(userId: string, req: DisclosureRequest): Promise<DisclosureResult> {
    const sessionId = req.sessionId.toLowerCase() as Hex;
    const user = this.users.findById(userId);
    if (!user) throw new NotFoundException("Akun tidak ditemukan");
    const role = req.role;

    // 1. Otorisasi. Pesan 404 sama untuk "bukan milikmu" dan "tidak ada", supaya sesi orang lain tidak bisa diintip.
    const manuscript = this.manuscripts.bySession(sessionId);
    if (role === Role.Author) {
      if (!manuscript || manuscript.ownerUserId !== userId) throw new NotFoundException("Naskah tidak ditemukan");
    } else {
      const mine = this.invitations.forSession(sessionId, "editor").find((i) => i.userId === userId && i.acceptedAt);
      if (!mine) throw new NotFoundException("Sesi tidak ditemukan");
      if (req.includeManuscript) throw new BadRequestException("Editor tidak bisa membuka naskah asli");
    }
    if (!user.permanentAddress || user.permanentAddress.toLowerCase() !== req.permanentAccount.toLowerCase()) {
      throw new BadRequestException({ error: "ACCOUNT_MISMATCH", message: "Akun permanen bukan akun yang terdaftar untuk pengguna ini" });
    }

    const session = await this.reader.getSession(sessionId);
    if (session.statusValue !== PublicationStatus.Published) {
      throw new ConflictException({ error: "NOT_PUBLISHED", message: `Pengungkapan hanya setelah terbit (status ${session.status})` });
    }

    const attributes = normalizeAttributes(req.attributes);
    if (Object.keys(attributes).length === 0 && !req.includeManuscript) {
      throw new BadRequestException("Pilih minimal satu atribut atau naskah asli untuk dibuka");
    }

    // Unggahan yang tertunda dari percobaan sebelumnya: selesaikan, jangan catat ulang.
    const already = await this.records.getDisclosure(sessionId, role);
    if (already) {
      const row = this.repo.disclosure(sessionId, role);
      if (row && row.userId === userId && row.originalCid && !row.originalUploadedAt) return this.finishUpload(row, session.originalManuscriptHash, sessionId);
      throw new ConflictException({ error: "ALREADY_DISCLOSED", message: "Identitas untuk peran ini sudah dibuka" });
    }

    // 2. Bukti di verifier on-chain.
    const hash = attributesHash(sessionId, role, attributes, req.salt);
    const pseudonym = role === Role.Author ? session.authorPseudonym : session.editorPseudonym;
    const signals = disclosureSignals(sessionId, pseudonym, req.permanentAccount, hash);
    if (!(await this.reader.verifyProof(ZkKind.SelectiveDisclosure, signals, req.proof))) {
      throw new BadRequestException({ error: "INVALID_PROOF", message: "Bukti pengungkapan tidak sah untuk pseudonim, akun, dan atribut ini" });
    }

    // 3. Keutuhan dan kebenaran atribut.
    let original: Uint8Array | null = null;
    let originalFile = "";
    if (role === Role.Author) {
      const m = manuscript!;
      const identity = await getJson<IdentityRecord>(this.privateStore, refs.identity(m.id, session.revisionCount));
      if (metadataCommitment(identity).toLowerCase() !== session.metadataHash.toLowerCase()) {
        throw new ConflictException({ error: "METADATA_MISMATCH", message: "Metadata di storage privat tidak cocok dengan hash on-chain" });
      }
      original = await this.privateStore.get(refs.original(m.id, session.revisionCount));
      if (sha256Hex(original).toLowerCase() !== session.originalManuscriptHash.toLowerCase()) {
        throw new ConflictException({ error: "ORIGINAL_HASH_MISMATCH", message: "Naskah asli di storage privat tidak cocok dengan originalManuscriptHash on-chain" });
      }
      originalFile = identity.originalFileName;
      const truth: DisclosureAttributes = { name: identity.authorName, affiliation: identity.affiliation, email: identity.authorEmail };
      for (const [k, v] of Object.entries(attributes) as [keyof DisclosureAttributes, string][]) {
        if (truth[k] !== v) throw new BadRequestException({ error: "ATTRIBUTE_MISMATCH", message: `Atribut ${k} tidak sama dengan data yang diajukan` });
      }
    } else if (attributes.email !== undefined && attributes.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new BadRequestException({ error: "ATTRIBUTE_MISMATCH", message: "Surel yang dibuka harus surel akun editor" });
    }

    // 4. Catat on-chain (CID dihitung dari isi; berkas belum diunggah).
    const includeManuscript = role === Role.Author && req.includeManuscript;
    const cid = includeManuscript ? await this.storage.cidOf(original!) : null;
    const tx = await this.records.recordDisclosure({
      sessionId,
      role,
      permanentAccount: req.permanentAccount,
      attributesHash: hash,
      originalManuscriptURI: cid ? `ipfs://${cid}` : "",
      proof: req.proof,
    });
    this.repo.insertDisclosure({
      sessionId,
      role,
      userId,
      pseudonym,
      permanentAccount: req.permanentAccount,
      attributes,
      salt: req.salt,
      attributesHash: hash,
      originalCid: cid,
      txHash: tx.txHash,
    });

    // 5. Unggah ke storage publik.
    if (cid) {
      const row = this.repo.disclosure(sessionId, role)!;
      return this.finishUpload(row, session.originalManuscriptHash, sessionId, original!, originalFile);
    }
    return { sessionId, role, attributes, attributesHash: hash, txHash: tx.txHash, originalManuscript: null };
  }

  /** Mengunggah naskah asli yang CID-nya sudah tercatat. Idempoten (CID content-addressed). */
  private async finishUpload(row: DisclosureRow, expectedSha256: Hex, sessionId: Hex, bytes?: Uint8Array, fileName?: string): Promise<DisclosureResult> {
    const manuscript = this.manuscripts.bySession(sessionId)!;
    let data = bytes;
    let name = fileName;
    if (!data) {
      const session = await this.reader.getSession(sessionId);
      data = await this.privateStore.get(refs.original(manuscript.id, session.revisionCount));
      name = (await getJson<IdentityRecord>(this.privateStore, refs.identity(manuscript.id, session.revisionCount))).originalFileName;
    }
    const put = await this.storage.put(data, name || "naskah-asli.pdf");
    if (put.cid !== row.originalCid) {
      throw new ConflictException({ error: "CID_MISMATCH", message: "CID hasil unggah berbeda dari yang tercatat on-chain" });
    }
    this.repo.markOriginalUploaded(sessionId, row.role);
    return {
      sessionId,
      role: row.role,
      attributes: row.attributes,
      attributesHash: row.attributesHash as Hex,
      txHash: row.txHash,
      originalManuscript: { cid: put.cid, sha256: expectedSha256, uploaded: true },
    };
  }
}


