/**
 * Pembungkus bertipe untuk `PublicationRecords` dan `DOIToken` (P08, M8). Semua penulisan oleh operator.
 * `ensureFinal` idempoten: aman dipanggil berulang dan dari banyak jalur (publikasi, retry).
 */
import { Injectable } from "@nestjs/common";
import { parseEventLogs, type Abi, type Address, type Hex } from "viem";
import { DOITokenAbi } from "@decpub/shared";
import { ChainService, type TxReceipt } from "../chain/chain.service.js";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { Inject } from "@nestjs/common";

export interface FinalView {
  sessionId: Hex;
  doiTokenId: number;
  doi: string;
  originalManuscriptHash: Hex;
  anonymizedManuscriptHash: Hex;
  metadataHash: Hex;
  anonymizedManuscriptURI: string;
  metadataURI: string;
  revisionCount: number;
  publishedAt: number;
}

export interface DisclosureView {
  role: 0 | 2;
  pseudonym: Address;
  permanentAccount: Address;
  attributesHash: Hex;
  originalManuscriptURI: string;
  disclosedAt: number;
}

export interface CommentLog {
  reader: Address;
  hash: Hex;
  txHash: Hex;
  blockNumber: number;
  logIndex: number;
}

@Injectable()
export class RecordsService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly chain: ChainService,
  ) {}

  async hasFinal(sessionId: Hex): Promise<boolean> {
    return this.chain.read<boolean>("PublicationRecords", "hasFinal", [sessionId]);
  }

  async getFinal(sessionId: Hex): Promise<FinalView | null> {
    const f = await this.chain.read<Record<string, unknown>>("PublicationRecords", "getFinal", [sessionId]);
    if (!f.exists) return null;
    return {
      sessionId,
      doiTokenId: Number(f.doiTokenId),
      doi: f.doi as string,
      originalManuscriptHash: f.originalManuscriptHash as Hex,
      anonymizedManuscriptHash: f.anonymizedManuscriptHash as Hex,
      metadataHash: f.metadataHash as Hex,
      anonymizedManuscriptURI: f.anonymizedManuscriptURI as string,
      metadataURI: f.metadataURI as string,
      revisionCount: Number(f.revisionCount),
      publishedAt: Number(f.publishedAt),
    };
  }

  /** Menerbitkan DOI bila belum ada (sesi harus `Published`). Mengembalikan catatan final dan tx bila baru diterbitkan. */
  async ensureFinal(sessionId: Hex): Promise<{ final: FinalView; issued: TxReceipt | null }> {
    const existing = await this.getFinal(sessionId);
    if (existing) return { final: existing, issued: null };
    const receipt = await this.chain.write("operator", "PublicationRecords", "recordFinal", [sessionId]);
    return { final: (await this.getFinal(sessionId))!, issued: receipt };
  }

  /** Semua sesi yang sudah diterbitkan, menurut urutan penerbitan. */
  async recordedSessions(): Promise<Hex[]> {
    const n = Number(await this.chain.read<bigint>("PublicationRecords", "recordedSessionCount"));
    const out: Hex[] = [];
    for (let i = 0; i < n; i++) out.push(await this.chain.read<Hex>("PublicationRecords", "recordedSessionAt", [i]));
    return out;
  }

  async getDisclosure(sessionId: Hex, role: 0 | 2): Promise<DisclosureView | null> {
    const d = await this.chain.read<Record<string, unknown>>("PublicationRecords", "getDisclosure", [sessionId, role]);
    if (!d.exists) return null;
    return {
      role,
      pseudonym: d.pseudonym as Address,
      permanentAccount: d.permanentAccount as Address,
      attributesHash: d.attributesHash as Hex,
      originalManuscriptURI: d.originalManuscriptURI as string,
      disclosedAt: Number(d.disclosedAt),
    };
  }

  recordDisclosure(p: {
    sessionId: Hex;
    role: 0 | 2;
    permanentAccount: Address;
    attributesHash: Hex;
    originalManuscriptURI: string;
    proof: Hex;
  }): Promise<TxReceipt> {
    return this.chain.write("operator", "PublicationRecords", "recordDisclosure", [
      p.sessionId,
      p.role,
      p.permanentAccount,
      p.attributesHash,
      p.originalManuscriptURI,
      p.proof,
    ]);
  }

  // ------------------------------------------------------------ komentar

  postComment(doiTokenId: number, hash: Hex): Promise<TxReceipt> {
    return this.chain.write("operator", "DOIToken", "postComment", [BigInt(doiTokenId), hash]);
  }

  /** Event `CommentPosted` sebuah DOI, urut kronologis. Dibaca per jendela blok (`LOG_WINDOW`). */
  async commentLogs(doiTokenId: number): Promise<CommentLog[]> {
    const client = this.chain.publicClient;
    const address = this.chain.addressOf("DOIToken");
    const latest = Number(await client.getBlockNumber({ cacheTime: 0 }));
    const out: CommentLog[] = [];
    for (let start = this.config.logFromBlock; start <= latest; start += this.config.logWindow) {
      const end = Math.min(start + this.config.logWindow - 1, latest);
      const logs = await client.getLogs({ address, fromBlock: BigInt(start), toBlock: BigInt(end) });
      for (const l of parseEventLogs({ abi: DOITokenAbi as Abi, logs, eventName: "CommentPosted", strict: false })) {
        const a = (l as unknown as { args: { doiId: bigint; reader: Address; hash: Hex } }).args;
        if (a.doiId !== BigInt(doiTokenId)) continue;
        out.push({ reader: a.reader, hash: a.hash, txHash: l.transactionHash!, blockNumber: Number(l.blockNumber), logIndex: l.logIndex! });
      }
    }
    return out.sort((x, y) => x.blockNumber - y.blockNumber || x.logIndex - y.logIndex);
  }
}
