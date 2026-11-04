import { Injectable } from "@nestjs/common";
import { DatabaseService, type Row } from "../db/database.service.js";

/** Penunjuk ke naskah. Isi asli dan identitas ada di storage privat, bukan di baris ini. */
export interface ManuscriptRow {
  id: string;
  ownerUserId: string;
  journalId: number;
  sessionId: string;
  title: string;
  originalHash: string;
  anonymizedHash: string;
  metadataHash: string;
  anonymizedCid: string;
  anonymizedUri: string;
  metadataCid: string;
  metadataUri: string;
  createdAt: string;
  submittedAt: string | null;
  publishedToStorageAt: string | null;
}

const fromRow = (r: Row): ManuscriptRow => ({
  id: r.id as string,
  ownerUserId: r.owner_user_id as string,
  journalId: r.journal_id as number,
  sessionId: r.session_id as string,
  title: r.title as string,
  originalHash: r.original_hash as string,
  anonymizedHash: r.anonymized_hash as string,
  metadataHash: r.metadata_hash as string,
  anonymizedCid: r.anonymized_cid as string,
  anonymizedUri: r.anonymized_uri as string,
  metadataCid: r.metadata_cid as string,
  metadataUri: r.metadata_uri as string,
  createdAt: r.created_at as string,
  submittedAt: (r.submitted_at as string | null) ?? null,
  publishedToStorageAt: (r.published_to_storage_at as string | null) ?? null,
});

@Injectable()
export class ManuscriptsRepository {
  constructor(private readonly db: DatabaseService) {}

  insert(m: Omit<ManuscriptRow, "createdAt" | "submittedAt" | "publishedToStorageAt">): ManuscriptRow {
    this.db.run(
      `INSERT INTO manuscripts (id, owner_user_id, journal_id, session_id, title, original_hash, anonymized_hash,
         metadata_hash, anonymized_cid, anonymized_uri, metadata_cid, metadata_uri, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      m.id,
      m.ownerUserId,
      m.journalId,
      m.sessionId,
      m.title,
      m.originalHash,
      m.anonymizedHash,
      m.metadataHash,
      m.anonymizedCid,
      m.anonymizedUri,
      m.metadataCid,
      m.metadataUri,
      new Date().toISOString(),
    );
    return this.byId(m.id)!;
  }

  byId(id: string): ManuscriptRow | undefined {
    const r = this.db.get("SELECT * FROM manuscripts WHERE id = ?", id);
    return r && fromRow(r);
  }

  bySession(sessionId: string): ManuscriptRow | undefined {
    const r = this.db.get("SELECT * FROM manuscripts WHERE session_id = ?", sessionId.toLowerCase());
    return r && fromRow(r);
  }

  listByOwner(userId: string): ManuscriptRow[] {
    return this.db.all("SELECT * FROM manuscripts WHERE owner_user_id = ? ORDER BY created_at DESC", userId).map(fromRow);
  }

  markSubmitted(id: string): void {
    this.db.run("UPDATE manuscripts SET submitted_at = ? WHERE id = ?", new Date().toISOString(), id);
  }

  markPublishedToStorage(id: string): void {
    this.db.run("UPDATE manuscripts SET published_to_storage_at = ? WHERE id = ?", new Date().toISOString(), id);
  }
}
