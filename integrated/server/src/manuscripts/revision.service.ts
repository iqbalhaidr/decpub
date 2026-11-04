/**
 * Revisi naskah (M5, keputusan B3). Dua langkah, seperti pengajuan awal:
 *
 *   intake : penulis mengunggah PDF revisi. Server menganonimkannya dengan transformasi yang sama
 *            seperti P04 (`anonymizePdf`), menghitung hash/CID, dan memberi `metadataHash` baru
 *            (salt baru). Identitas penulis disalin dari revisi sebelumnya (nama dan surel tidak
 *            berubah), judul/abstrak/kata kunci boleh diganti. Hasilnya di staging, belum on-chain.
 *   submit : aksi `RecordRevision` bertanda tangan pseudonim Author. Server memeriksa isinya sama
 *            dengan hasil intake, mengunggah naskah anonim dan metadata ke storage publik, lalu
 *            meneruskan ke gateway. Kontrak yang menentukan jalur berikutnya:
 *              MinorRevisionRequired -> AssigningReviewers      (penelaah yang sama, pseudonim baru)
 *              MajorRevisionRequired -> UnderEditorialScreening (editor yang sama)
 *
 * Revisi tidak melewati lagi P03-P04 on-chain (B3, arsitektur bagian 13), tetapi anonimisasinya
 * tetap dijalankan karena `recordRevision` mewajibkan hash anonim baru.
 */
import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, PayloadTooLargeException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { toHex, type Address, type Hex } from "viem";
import { PublicationStatus, type RevisionAction, type StorageProvider } from "@decpub/shared";
import type { TxReceipt } from "../chain/chain.service.js";
import { GatewayService } from "../chain/gateway.service.js";
import { SessionReader } from "../chain/session-reader.service.js";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { ProgressService, type ProgressResult } from "../flows/progress.service.js";
import { JournalsRepository } from "../journals/journals.repository.js";
import { looksLikePdf, readPdfInfo } from "../pdf/pdf-info.js";
import { extractPdfText } from "../pdf/pdf-text.js";
import { PRIVATE_STORE, type PrivateStore } from "../storage/private-store.js";
import { PUBLIC_STORAGE } from "../storage/storage.module.js";
import { findExposedIdentity } from "./checks.service.js";
import { IntakeService, sha256Hex } from "./intake.service.js";
import { getJson, putJson, refs, type IdentityRecord } from "./manuscript-files.js";
import { metadataCommitment, type MetadataRecord } from "./metadata.js";
import { ManuscriptsRepository, type ManuscriptRow } from "./manuscripts.repository.js";
import { RevisionsRepository } from "./revisions.repository.js";

export interface RevisionIntakeInput {
  title?: string;
  abstract?: string;
  keywords?: string[];
}

export interface RevisionIntakeResult {
  manuscriptId: string;
  sessionId: Hex;
  /** Nomor revisi yang akan dicatat (= `revisionCount` on-chain + 1). */
  revision: number;
  /** Jalur yang akan ditempuh sesi setelah revisi dicatat. */
  nextStatus: "AssigningReviewers" | "UnderEditorialScreening";
  newOriginalManuscriptHash: Hex;
  newAnonymizedManuscriptHash: Hex;
  newMetadataHash: Hex;
  newAnonymizedManuscriptURI: string;
  newMetadataURI: string;
  warnings: string[];
}

export interface SignedRevision {
  action: Omit<RevisionAction, "nonce"> & { nonce: string };
  signature: Hex;
}

const REVISION_STATUSES: number[] = [PublicationStatus.MinorRevisionRequired, PublicationStatus.MajorRevisionRequired];

@Injectable()
export class RevisionService {
  private readonly log = new Logger(RevisionService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PUBLIC_STORAGE) private readonly storage: StorageProvider,
    @Inject(PRIVATE_STORE) private readonly privateStore: PrivateStore,
    private readonly gateway: GatewayService,
    private readonly reader: SessionReader,
    private readonly intakes: IntakeService,
    private readonly journals: JournalsRepository,
    private readonly manuscripts: ManuscriptsRepository,
    private readonly revisions: RevisionsRepository,
    private readonly progress: ProgressService,
  ) {}

  private owned(manuscriptId: string, userId: string): ManuscriptRow {
    const m = this.manuscripts.byId(manuscriptId);
    // Pesan sama untuk "tidak ada" dan "milik orang lain": tidak membocorkan keberadaan naskah.
    if (!m || m.ownerUserId !== userId) throw new NotFoundException("Naskah tidak ditemukan");
    if (!m.submittedAt) throw new ConflictException("Naskah ini belum diajukan");
    return m;
  }

  private async requireRevisionRequested(sessionId: Hex) {
    const s = await this.reader.getSession(sessionId);
    if (!REVISION_STATUSES.includes(s.statusValue)) {
      throw new ConflictException(`Sesi tidak sedang meminta revisi (status ${s.status})`);
    }
    return s;
  }

  async intake(userId: string, manuscriptId: string, file: { buffer: Buffer; originalname: string }, input: RevisionIntakeInput): Promise<RevisionIntakeResult> {
    const m = this.owned(manuscriptId, userId);
    const sessionId = m.sessionId as Hex;
    const session = await this.requireRevisionRequested(sessionId);
    const revision = session.revisionCount + 1;

    const original = new Uint8Array(file.buffer);
    if (original.length === 0) throw new BadRequestException("Berkas kosong");
    if (original.length > this.config.maxUploadBytes) throw new PayloadTooLargeException("Berkas terlalu besar");
    if (!looksLikePdf(original)) throw new BadRequestException("Hanya berkas PDF yang diterima");
    if (!(await readPdfInfo(original)).readable) throw new BadRequestException("PDF tidak bisa dibaca atau rusak");

    const journal = this.journals.get(m.journalId);
    if (!journal) throw new NotFoundException("Jurnal tidak ditemukan");
    // Identitas revisi sebelumnya (revisi 0 = pengajuan awal). Nama/surel tetap, salt metadata baru.
    const previous = await getJson<IdentityRecord>(this.privateStore, refs.identity(m.id, session.revisionCount));
    const next: MetadataRecord = {
      ...previous,
      title: input.title ?? previous.title,
      abstract: input.abstract ?? previous.abstract,
      keywords: input.keywords ?? previous.keywords,
      originalFileName: file.originalname,
      originalFileSize: original.length,
      salt: toHex(randomBytes(32)),
    };

    const { anon, anonCid, publicMetadataBytes, metadataCid } = await this.intakes.prepare(original, journal, next);
    const staged = this.revisions.upsertStaged({
      manuscriptId: m.id,
      revision,
      originalHash: sha256Hex(original),
      anonymizedHash: sha256Hex(anon.bytes),
      metadataHash: metadataCommitment(next),
      anonymizedCid: anonCid,
      anonymizedUri: `ipfs://${anonCid}`,
      metadataCid,
      metadataUri: `ipfs://${metadataCid}`,
    });
    await this.privateStore.put(refs.original(m.id, revision), original);
    await this.privateStore.put(refs.anonymizedStaging(m.id, revision), anon.bytes);
    await this.privateStore.put(refs.publicMetadataStaging(m.id, revision), publicMetadataBytes);
    await putJson(this.privateStore, refs.identity(m.id, revision), next);

    const warnings: string[] = [];
    const exposed = findExposedIdentity(await extractPdfText(anon.bytes), next);
    if (exposed.length > 0) {
      warnings.push(`identityExposed: ${exposed.join(", ")} masih terbaca di isi naskah anonim (anonimisasi hanya metadata dan sampul, B1)`);
    }
    return {
      manuscriptId: m.id,
      sessionId,
      revision,
      nextStatus: session.statusValue === PublicationStatus.MinorRevisionRequired ? "AssigningReviewers" : "UnderEditorialScreening",
      newOriginalManuscriptHash: staged.originalHash as Hex,
      newAnonymizedManuscriptHash: staged.anonymizedHash as Hex,
      newMetadataHash: staged.metadataHash as Hex,
      newAnonymizedManuscriptURI: staged.anonymizedUri,
      newMetadataURI: staged.metadataUri,
      warnings,
    };
  }

  async submit(userId: string, manuscriptId: string, signed: SignedRevision): Promise<{ revision: number; tx: TxReceipt; status: string; progress?: ProgressResult; notes?: string[] }> {
    const m = this.owned(manuscriptId, userId);
    const sessionId = m.sessionId as Hex;
    const session = await this.requireRevisionRequested(sessionId);
    const revision = session.revisionCount + 1;
    const staged = this.revisions.get(m.id, revision);
    if (!staged || staged.recordedAt) throw new ConflictException("Belum ada intake revisi untuk revisi ini (POST /manuscripts/:id/revisions/intake)");

    const a = signed.action;
    const expected: Record<string, string> = {
      sessionId: m.sessionId,
      newOriginalManuscriptHash: staged.originalHash,
      newAnonymizedManuscriptHash: staged.anonymizedHash,
      newMetadataHash: staged.metadataHash,
      newAnonymizedManuscriptURI: staged.anonymizedUri,
      newMetadataURI: staged.metadataUri,
    };
    for (const [k, v] of Object.entries(expected)) {
      if (String((a as Record<string, unknown>)[k]).toLowerCase() !== v.toLowerCase()) {
        throw new BadRequestException(`Field ${k} tidak sama dengan hasil intake revisi`);
      }
    }
    // Gateway juga memeriksa ini; pesan di sini lebih jelas dan menghindari transaksi yang pasti gagal.
    if (a.pseudonym.toLowerCase() !== session.authorPseudonym.toLowerCase()) {
      throw new BadRequestException("Pseudonim bukan Author sesi ini");
    }

    // Naskah anonim harus ada di storage publik sebelum hash-nya dicatat, dan cocok dengan yang dihitung saat intake.
    const anon = await this.privateStore.get(refs.anonymizedStaging(m.id, revision));
    const meta = await this.privateStore.get(refs.publicMetadataStaging(m.id, revision));
    const anonPut = await this.storage.put(anon, "anonymized-manuscript.pdf");
    const metaPut = await this.storage.put(meta, "public-metadata.json");
    if (`ipfs://${anonPut.cid}` !== staged.anonymizedUri || `ipfs://${metaPut.cid}` !== staged.metadataUri) {
      throw new ConflictException("CID hasil unggah revisi tidak sama dengan yang dihitung saat intake");
    }

    const tx = await this.gateway.recordRevisionSigned({ ...a, pseudonym: a.pseudonym as Address, sessionId: a.sessionId as Hex, nonce: BigInt(a.nonce) } as RevisionAction, signed.signature);
    this.revisions.markRecorded(m.id, revision);

    const out: { revision: number; tx: TxReceipt; status: string; progress?: ProgressResult; notes?: string[] } = {
      revision,
      tx,
      status: (await this.reader.getSession(sessionId)).status,
    };
    if (this.config.autoAdvance) {
      // Kegagalan langkah sistem lanjutan (mis. kandidat penelaah kurang) tidak membatalkan revisi yang sudah sah on-chain.
      try {
        out.progress = await this.progress.advance(sessionId);
        out.status = out.progress.status;
      } catch (e) {
        const msg = (e as { response?: { message?: string } }).response?.message ?? (e as Error).message;
        out.notes = [`Langkah sistem tertunda: ${msg}`];
        this.log.warn(`Sesi ${sessionId}: langkah sistem setelah revisi tertunda (${msg})`);
      }
    }
    return out;
  }
}
