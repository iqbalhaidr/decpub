/**
 * P04 - Penghapusan identitas (F07-F08): unggah naskah anonim ke storage PUBLIK dan majukan status.
 *
 * Transformasi anonimisasi sudah dijalankan di P02 (`IntakeService`) karena hash-nya harus
 * dicatat saat sesi dibuat. Di sini berkas hasilnya benar-benar dipublikasikan, lalu diperiksa
 * silang dengan apa yang tercatat on-chain:
 *   - CID hasil unggah == CID yang dihitung di P02 == CID di `anonymizedManuscriptURI` on-chain
 *   - sha256 isi yang diunduh kembali == `anonymizedManuscriptHash` on-chain
 * Baru setelah itu `updateStatus(UnderEditorialScreening)`.
 *
 * Naskah ASLI tidak pernah menyentuh storage publik.
 */
import { BadRequestException, ConflictException, Inject, Injectable, InternalServerErrorException } from "@nestjs/common";
import type { Hex } from "viem";
import { PublicationStatus, type StorageProvider } from "@decpub/shared";
import { GatewayService } from "../chain/gateway.service.js";
import type { TxReceipt } from "../chain/chain.service.js";
import { SessionReader } from "../chain/session-reader.service.js";
import { PUBLIC_STORAGE } from "../storage/storage.module.js";
import { PRIVATE_STORE, type PrivateStore } from "../storage/private-store.js";
import { refs } from "./manuscript-files.js";
import { ManuscriptsRepository, type ManuscriptRow } from "./manuscripts.repository.js";
import { sha256Hex } from "./intake.service.js";

export interface PublishResult {
  anonymizedCid: string;
  metadataCid: string;
  tx: TxReceipt;
}

@Injectable()
export class AnonymizationService {
  constructor(
    @Inject(PUBLIC_STORAGE) private readonly storage: StorageProvider,
    @Inject(PRIVATE_STORE) private readonly privateStore: PrivateStore,
    private readonly gateway: GatewayService,
    private readonly reader: SessionReader,
    private readonly manuscripts: ManuscriptsRepository,
  ) {}

  async publish(m: ManuscriptRow): Promise<PublishResult> {
    const sessionId = m.sessionId as Hex;
    const session = await this.reader.getSession(sessionId);
    if (session.statusValue !== PublicationStatus.UnderAnonymization) {
      throw new ConflictException(`Sesi belum siap untuk P04. Status saat ini: ${session.status}`);
    }

    const anon = await this.privateStore.get(refs.anonymizedStaging(m.id));
    const metadata = await this.privateStore.get(refs.publicMetadataStaging(m.id));

    // Keselarasan dengan catatan on-chain, diperiksa SEBELUM mengunggah dan memajukan status.
    if (sha256Hex(anon) !== session.anonymizedManuscriptHash) {
      throw new InternalServerErrorException("Hash naskah anonim di staging tidak sama dengan yang tercatat on-chain");
    }
    if (session.anonymizedManuscriptURI !== m.anonymizedUri || session.metadataURI !== m.metadataUri) {
      throw new InternalServerErrorException("URI on-chain tidak sama dengan yang dihitung saat pengajuan");
    }

    const anonPut = await this.storage.put(anon, "anonymized-manuscript.pdf");
    const metaPut = await this.storage.put(metadata, "public-metadata.json");
    if (`ipfs://${anonPut.cid}` !== session.anonymizedManuscriptURI) {
      throw new BadRequestException(`CID hasil unggah (${anonPut.cid}) tidak sama dengan URI on-chain (${session.anonymizedManuscriptURI})`);
    }
    if (`ipfs://${metaPut.cid}` !== session.metadataURI) {
      throw new BadRequestException(`CID metadata hasil unggah (${metaPut.cid}) tidak sama dengan URI on-chain`);
    }

    // Unduh kembali dari gateway: bukti bahwa yang publik adalah yang tercatat.
    const roundTrip = await this.storage.get(anonPut.cid);
    if (sha256Hex(roundTrip) !== session.anonymizedManuscriptHash) {
      throw new InternalServerErrorException("Isi yang diunduh dari storage tidak cocok dengan hash on-chain");
    }

    const tx = await this.gateway.updateStatus(sessionId, PublicationStatus.UnderEditorialScreening);
    this.manuscripts.markPublishedToStorage(m.id);
    return { anonymizedCid: anonPut.cid, metadataCid: metaPut.cid, tx };
  }
}
