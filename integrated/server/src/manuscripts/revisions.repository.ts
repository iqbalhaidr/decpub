import { Injectable } from "@nestjs/common";
import { DatabaseService, type Row } from "../db/database.service.js";

/**
 * Satu revisi naskah (nomor >= 1). Revisi 0 adalah baris `manuscripts` itu sendiri.
 * `recordedAt == null` berarti berkasnya sudah di-intake tetapi belum ditandatangani/dicatat on-chain.
 */
export interface RevisionRow {
  manuscriptId: string;
  revision: number;
  originalHash: string;
  anonymizedHash: string;
  metadataHash: string;
  anonymizedCid: string;
  anonymizedUri: string;
  metadataCid: string;
  metadataUri: string;
  createdAt: string;
  recordedAt: string | null;
}

const fromRow = (r: Row): RevisionRow => ({
  manuscriptId: r.manuscript_id as string,
  revision: r.revision as number,
  originalHash: r.original_hash as string,
  anonymizedHash: r.anonymized_hash as string,
  metadataHash: r.metadata_hash as string,
  anonymizedCid: r.anonymized_cid as string,
  anonymizedUri: r.anonymized_uri as string,
  metadataCid: r.metadata_cid as string,
  metadataUri: r.metadata_uri as string,
  createdAt: r.created_at as string,
  recordedAt: (r.recorded_at as string | null) ?? null,
});

@Injectable()
export class RevisionsRepository {
  constructor(private readonly db: DatabaseService) {}

  /** Menyimpan (atau mengganti) revisi yang masih menunggu tanda tangan. Revisi yang sudah tercatat tidak bisa diganti. */
  upsertStaged(r: Omit<RevisionRow, "createdAt" | "recordedAt">): RevisionRow {
    const existing = this.get(r.manuscriptId, r.revision);
    if (existing?.recordedAt) throw new Error("Revisi ini sudah tercatat on-chain");
    this.db.run(
      `INSERT OR REPLACE INTO manuscript_revisions
         (manuscript_id, revision, original_hash, anonymized_hash, metadata_hash, anonymized_cid, anonymized_uri,
          metadata_cid, metadata_uri, created_at, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      r.manuscriptId,
      r.revision,
      r.originalHash,
      r.anonymizedHash,
      r.metadataHash,
      r.anonymizedCid,
      r.anonymizedUri,
      r.metadataCid,
      r.metadataUri,
      new Date().toISOString(),
    );
    return this.get(r.manuscriptId, r.revision)!;
  }

  get(manuscriptId: string, revision: number): RevisionRow | undefined {
    const r = this.db.get("SELECT * FROM manuscript_revisions WHERE manuscript_id = ? AND revision = ?", manuscriptId, revision);
    return r && fromRow(r);
  }

  markRecorded(manuscriptId: string, revision: number): void {
    this.db.run("UPDATE manuscript_revisions SET recorded_at = ? WHERE manuscript_id = ? AND revision = ?", new Date().toISOString(), manuscriptId, revision);
  }

  /** Revisi yang sudah tercatat, urut naik. */
  recorded(manuscriptId: string): RevisionRow[] {
    return this.db
      .all("SELECT * FROM manuscript_revisions WHERE manuscript_id = ? AND recorded_at IS NOT NULL ORDER BY revision", manuscriptId)
      .map(fromRow);
  }
}
