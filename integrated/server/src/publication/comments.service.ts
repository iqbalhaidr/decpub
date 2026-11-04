/**
 * Komentar pembaca (P08). Port dari `repository/comment.go` + `Comments.tsx` Roihan: hash komentar ada
 * on-chain (`DOIToken.postComment`), isinya di server. Bedanya: relayer yang memosting (reader = operator),
 * dan nama tampilan tidak membuka surel (Roihan menampilkan alamat dan surel).
 */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { toHex, type Hex } from "viem";
import { MAX_COMMENT_CHARS, commentHash } from "@decpub/shared";
import { ChainService } from "../chain/chain.service.js";
import { PublicationRepository } from "./publication.repository.js";
import { RecordsService } from "./records.service.js";

export interface CommentView {
  handle: string | null;
  /** null bila komentar diposting langsung ke chain oleh pihak lain (hash tanpa isi di server). */
  body: string | null;
  contentHash: Hex;
  txHash: Hex;
  blockNumber: number;
  postedAt: number;
  /** Hash dari (DOI, nama, isi, nonce) cocok dengan event on-chain. */
  verified: boolean;
}

/** Nama tampilan: stabil per (akun, artikel), berbeda antarartikel, tidak memuat surel. */
export function commentHandle(userId: string, sessionId: string): string {
  return "pembaca-" + createHash("sha256").update(`${userId}|${sessionId.toLowerCase()}`).digest("hex").slice(0, 6);
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly records: RecordsService,
    private readonly repo: PublicationRepository,
    private readonly chain: ChainService,
  ) {}

  async post(userId: string, sessionId: Hex, rawBody: string): Promise<CommentView> {
    const body = rawBody.trim();
    if (!body) throw new BadRequestException("Komentar kosong");
    if (body.length > MAX_COMMENT_CHARS) throw new BadRequestException(`Komentar terlalu panjang (maks. ${MAX_COMMENT_CHARS} karakter)`);
    const final = await this.records.getFinal(sessionId);
    if (!final) throw new NotFoundException("Artikel belum terbit; komentar hanya untuk artikel dengan DOI");

    const handle = commentHandle(userId, sessionId);
    const nonce = toHex(randomBytes(16), { size: 32 });
    const hash = commentHash(final.doiTokenId, handle, body, nonce);
    if (this.repo.commentByHash(hash)) throw new ConflictException("Komentar duplikat");
    const tx = await this.records.postComment(final.doiTokenId, hash);
    this.repo.insertComment({ sessionId, doiTokenId: final.doiTokenId, userId, handle, body, nonce, contentHash: hash, txHash: tx.txHash });
    return { handle, body, contentHash: hash, txHash: tx.txHash, blockNumber: tx.blockNumber, postedAt: await this.blockTime(tx.blockNumber), verified: true };
  }

  async list(sessionId: Hex): Promise<{ doi: string; doiTokenId: number; comments: CommentView[] }> {
    const final = await this.records.getFinal(sessionId);
    if (!final) throw new NotFoundException("Artikel tidak ditemukan");
    const comments: CommentView[] = [];
    for (const log of await this.records.commentLogs(final.doiTokenId)) {
      const row = this.repo.commentByHash(log.hash);
      comments.push({
        handle: row?.handle ?? null,
        body: row?.body ?? null,
        contentHash: log.hash,
        txHash: log.txHash,
        blockNumber: log.blockNumber,
        postedAt: await this.blockTime(log.blockNumber),
        verified: !!row && commentHash(final.doiTokenId, row.handle, row.body, row.nonce as Hex).toLowerCase() === log.hash.toLowerCase(),
      });
    }
    return { doi: final.doi, doiTokenId: final.doiTokenId, comments };
  }

  private async blockTime(blockNumber: number): Promise<number> {
    const b = await this.chain.publicClient.getBlock({ blockNumber: BigInt(blockNumber) });
    return Number(b.timestamp);
  }
}
