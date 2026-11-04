/**
 * P02 - Pengajuan manuskrip, sisi server (sebelum pseudonim menandatangani).
 *
 * Urutan di `intake`:
 *  1. Berkas asli dan identitas penulis disimpan terenkripsi di storage privat. Tidak ada
 *     yang dikirim ke storage publik.
 *  2. Naskah anonim dihitung SEKARANG (anonimisasi P04), karena `createSession` mencatat
 *     `anonymizedManuscriptHash` dan URI saat P02 (`PublicationSessions.sol:50`). CID bersifat
 *     content-addressed, jadi bisa dihitung (`cidOf`) sebelum berkas diunggah; unggahnya
 *     baru di P04 (`AnonymizationService.publish`).
 *  3. `metadataHash` dihitung dengan salt (lihat `metadata.ts`).
 *
 * Balasannya berisi semua nilai yang harus ditandatangani pseudonim penulis di klien.
 */
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from "@nestjs/common";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { toHex, type Hex } from "viem";
import type { StorageProvider } from "@decpub/shared";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { JournalsRepository } from "../journals/journals.repository.js";
import { anonymizePdf } from "../pdf/anonymizer.js";
import { looksLikePdf, readPdfInfo } from "../pdf/pdf-info.js";
import { PUBLIC_STORAGE } from "../storage/storage.module.js";
import { PRIVATE_STORE, type PrivateStore } from "../storage/private-store.js";
import { UsersRepository } from "../users/users.repository.js";
import { ManuscriptsRepository, type ManuscriptRow } from "./manuscripts.repository.js";
import { putJson, refs } from "./manuscript-files.js";
import { metadataCommitment, type MetadataRecord } from "./metadata.js";

export interface IntakeInput {
  journalId: number;
  title: string;
  abstract?: string;
  keywords?: string[];
  authorName: string;
  authorEmail: string;
  affiliation?: string;
}

/** Metadata publik (anonim) yang diunggah di P04. Tanpa nama, surel, afiliasi, dan nama berkas asli. */
export interface PublicMetadata {
  schema: "decpub.public-metadata.v1";
  title: string;
  abstract: string;
  keywords: string[];
  journal: { id: number; name: string; category: string };
  anonymizedManuscript: { cid: string; size: number; sha256: Hex };
}

export const sha256Hex = (bytes: Uint8Array): Hex => `0x${createHash("sha256").update(bytes).digest("hex")}`;

@Injectable()
export class IntakeService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PUBLIC_STORAGE) private readonly storage: StorageProvider,
    @Inject(PRIVATE_STORE) private readonly privateStore: PrivateStore,
    private readonly users: UsersRepository,
    private readonly journals: JournalsRepository,
    private readonly manuscripts: ManuscriptsRepository,
  ) {}

  async intake(userId: string, file: { buffer: Buffer; originalname: string }, input: IntakeInput): Promise<ManuscriptRow & { warnings: string[] }> {
    const user = this.users.findById(userId);
    if (!user) throw new NotFoundException("Akun tidak ditemukan");
    if (user.role !== "author" && user.role !== "reviewer") throw new BadRequestException("Hanya akun penulis atau penelaah yang bisa mengajukan naskah");
    if (!user.identityCommitment) throw new ConflictException({ error: "IDENTITY_NOT_REGISTERED", message: "Daftarkan identitas dulu (POST /me/identity)" });

    const journal = this.journals.get(input.journalId);
    if (!journal) throw new NotFoundException("Jurnal tidak ditemukan");

    const original = new Uint8Array(file.buffer);
    if (original.length === 0) throw new BadRequestException("Berkas kosong");
    if (original.length > this.config.maxUploadBytes) throw new PayloadTooLargeException("Berkas terlalu besar");
    if (!looksLikePdf(original)) throw new BadRequestException("Hanya berkas PDF yang diterima (DOCX tidak didukung di versi terintegrasi)");
    // PDF yang tak bisa dibaca ditolak di sini, sebelum menyentuh chain: tidak ada sesi, tidak ada APC terpakai.
    if (!(await readPdfInfo(original)).readable) throw new BadRequestException("PDF tidak bisa dibaca atau rusak");

    const { anon, anonCid, publicMetadataBytes, metadataCid } = await this.prepare(original, journal, input);
    const abstract = input.abstract ?? "";
    const keywords = input.keywords ?? [];

    const identity: MetadataRecord = {
      title: input.title,
      abstract,
      keywords,
      journalId: journal.id,
      authorName: input.authorName,
      authorEmail: input.authorEmail,
      affiliation: input.affiliation ?? "",
      originalFileName: file.originalname,
      originalFileSize: original.length,
      salt: toHex(randomBytes(32)),
    };

    const id = randomUUID();
    await this.privateStore.put(refs.original(id), original);
    await this.privateStore.put(refs.anonymizedStaging(id), anon.bytes);
    await this.privateStore.put(refs.publicMetadataStaging(id), publicMetadataBytes);
    await putJson(this.privateStore, refs.identity(id), identity);

    const row = this.manuscripts.insert({
      id,
      ownerUserId: userId,
      journalId: journal.id,
      sessionId: toHex(randomBytes(32)),
      title: input.title,
      originalHash: sha256Hex(original),
      anonymizedHash: sha256Hex(anon.bytes),
      metadataHash: metadataCommitment(identity),
      anonymizedCid: anonCid,
      anonymizedUri: `ipfs://${anonCid}`,
      metadataCid,
      metadataUri: `ipfs://${metadataCid}`,
    });

    const warnings: string[] = [];
    if (this.config.escrowRequired) warnings.push("ESCROW_REQUIRED aktif, tetapi pengikatan APC baru ada di M7");
    return { ...row, warnings };
  }

  /**
   * Menghitung artefak anonim sebuah berkas: PDF anonim, CID-nya, dan metadata publik beserta CID.
   * Dipakai intake awal dan intake revisi (M5): keduanya harus menghasilkan nilai yang dicatat on-chain.
   */
  async prepare(
    original: Uint8Array,
    journal: { id: number; name: string; categorySlug: string },
    input: Pick<IntakeInput, "title" | "abstract" | "keywords">,
  ) {
    // Anonimisasi (P04) dihitung sekarang agar hash dan CID-nya bisa dicatat on-chain sebelum diunggah.
    const anon = await anonymizePdf(original);
    const anonCid = await this.storage.cidOf(anon.bytes);
    const publicMetadata: PublicMetadata = {
      schema: "decpub.public-metadata.v1",
      title: input.title,
      abstract: input.abstract ?? "",
      keywords: input.keywords ?? [],
      journal: { id: journal.id, name: journal.name, category: journal.categorySlug },
      anonymizedManuscript: { cid: anonCid, size: anon.bytes.length, sha256: sha256Hex(anon.bytes) },
    };
    const publicMetadataBytes = new TextEncoder().encode(JSON.stringify(publicMetadata));
    const metadataCid = await this.storage.cidOf(publicMetadataBytes);
    return { anon, anonCid, publicMetadataBytes, metadataCid };
  }
}
