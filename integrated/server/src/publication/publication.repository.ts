/** Penyimpanan SQLite untuk P08: pengungkapan identitas dan isi komentar. */
import { Injectable } from "@nestjs/common";
import type { DisclosureAttributes } from "@decpub/shared";
import { DatabaseService, type Row } from "../db/database.service.js";

export interface DisclosureRow {
  sessionId: string;
  role: 0 | 2;
  userId: string;
  pseudonym: string;
  permanentAccount: string;
  /** Hanya atribut yang dipilih. */
  attributes: DisclosureAttributes;
  salt: string;
  attributesHash: string;
  originalCid: string | null;
  originalUploadedAt: string | null;
  txHash: string;
  disclosedAt: string;
}

const disclosureFrom = (r: Row): DisclosureRow => ({
  sessionId: r.session_id as string,
  role: r.role as 0 | 2,
  userId: r.user_id as string,
  pseudonym: r.pseudonym as string,
  permanentAccount: r.permanent_account as string,
  attributes: JSON.parse(r.attributes_json as string),
  salt: r.salt as string,
  attributesHash: r.attributes_hash as string,
  originalCid: (r.original_cid as string | null) ?? null,
  originalUploadedAt: (r.original_uploaded_at as string | null) ?? null,
  txHash: r.tx_hash as string,
  disclosedAt: r.disclosed_at as string,
});

export interface CommentRow {
  id: number;
  sessionId: string;
  doiTokenId: number;
  userId: string;
  handle: string;
  body: string;
  nonce: string;
  contentHash: string;
  txHash: string;
  createdAt: string;
}

const commentFrom = (r: Row): CommentRow => ({
  id: r.id as number,
  sessionId: r.session_id as string,
  doiTokenId: r.doi_token_id as number,
  userId: r.user_id as string,
  handle: r.handle as string,
  body: r.body as string,
  nonce: r.nonce as string,
  contentHash: r.content_hash as string,
  txHash: r.tx_hash as string,
  createdAt: r.created_at as string,
});

@Injectable()
export class PublicationRepository {
  constructor(private readonly db: DatabaseService) {}

  // ---- pengungkapan

  insertDisclosure(d: Omit<DisclosureRow, "disclosedAt" | "originalUploadedAt">): void {
    this.db.run(
      `INSERT INTO disclosures (session_id, role, user_id, pseudonym, permanent_account, attributes_json, salt,
         attributes_hash, original_cid, tx_hash, disclosed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      d.sessionId.toLowerCase(),
      d.role,
      d.userId,
      d.pseudonym,
      d.permanentAccount,
      JSON.stringify(d.attributes),
      d.salt,
      d.attributesHash,
      d.originalCid,
      d.txHash,
      new Date().toISOString(),
    );
  }

  disclosure(sessionId: string, role: 0 | 2): DisclosureRow | undefined {
    const r = this.db.get("SELECT * FROM disclosures WHERE session_id = ? AND role = ?", sessionId.toLowerCase(), role);
    return r && disclosureFrom(r);
  }

  markOriginalUploaded(sessionId: string, role: 0 | 2): void {
    this.db.run(
      "UPDATE disclosures SET original_uploaded_at = ? WHERE session_id = ? AND role = ?",
      new Date().toISOString(),
      sessionId.toLowerCase(),
      role,
    );
  }

  countDisclosures(role: 0 | 2): number {
    return Number(this.db.get("SELECT COUNT(*) AS n FROM disclosures WHERE role = ?", role)?.n ?? 0);
  }

  // ---- komentar

  insertComment(c: Omit<CommentRow, "id" | "createdAt">): CommentRow {
    const { lastInsertRowid } = this.db.run(
      `INSERT INTO comments (session_id, doi_token_id, user_id, handle, body, nonce, content_hash, tx_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      c.sessionId.toLowerCase(),
      c.doiTokenId,
      c.userId,
      c.handle,
      c.body,
      c.nonce,
      c.contentHash.toLowerCase(),
      c.txHash,
      new Date().toISOString(),
    );
    return commentFrom(this.db.get("SELECT * FROM comments WHERE id = ?", lastInsertRowid)!);
  }

  commentByHash(hash: string): CommentRow | undefined {
    const r = this.db.get("SELECT * FROM comments WHERE content_hash = ?", hash.toLowerCase());
    return r && commentFrom(r);
  }

  countComments(): number {
    return Number(this.db.get("SELECT COUNT(*) AS n FROM comments")?.n ?? 0);
  }
}
