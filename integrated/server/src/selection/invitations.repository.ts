import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService, type Row } from "../db/database.service.js";

export type InviteRole = "editor" | "reviewer";

export interface Invitation {
  id: string;
  sessionId: string;
  role: InviteRole;
  slot: number;
  userId: string;
  inviteSalt: string;
  assignmentCommitment: string;
  criteriaHash: string;
  criteriaFields: string[];
  proofRef: string;
  proofUri: string;
  createdAt: string;
  acceptedAt: string | null;
  /** Terisi bila batch-nya ditinggalkan karena tidak ada reveal (M5). */
  voidedAt: string | null;
}

const fromRow = (r: Row): Invitation => ({
  id: r.id as string,
  sessionId: r.session_id as string,
  role: r.role as InviteRole,
  slot: r.slot as number,
  userId: r.user_id as string,
  inviteSalt: r.invite_salt as string,
  assignmentCommitment: r.assignment_commitment as string,
  criteriaHash: r.criteria_hash as string,
  criteriaFields: JSON.parse(r.criteria_fields as string),
  proofRef: r.proof_ref as string,
  proofUri: r.proof_uri as string,
  createdAt: r.created_at as string,
  acceptedAt: (r.accepted_at as string | null) ?? null,
  voidedAt: (r.voided_at as string | null) ?? null,
});

export interface SessionCriteria {
  sessionId: string;
  revision: number;
  fields: string[];
  criteriaHash: string;
}

@Injectable()
export class InvitationsRepository {
  constructor(private readonly db: DatabaseService) {}

  insert(i: Omit<Invitation, "id" | "createdAt" | "acceptedAt" | "voidedAt">): Invitation {
    const id = randomUUID();
    this.db.run(
      `INSERT INTO invitations (id, session_id, role, slot, user_id, invite_salt, assignment_commitment,
         criteria_hash, criteria_fields, proof_ref, proof_uri, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      i.sessionId.toLowerCase(),
      i.role,
      i.slot,
      i.userId,
      i.inviteSalt,
      i.assignmentCommitment.toLowerCase(),
      i.criteriaHash,
      JSON.stringify(i.criteriaFields),
      i.proofRef,
      i.proofUri,
      new Date().toISOString(),
    );
    return this.byId(id)!;
  }

  byId(id: string): Invitation | undefined {
    const r = this.db.get("SELECT * FROM invitations WHERE id = ?", id);
    return r && fromRow(r);
  }

  byCommitment(sessionId: string, commitment: string): Invitation | undefined {
    const r = this.db.get("SELECT * FROM invitations WHERE session_id = ? AND assignment_commitment = ?", sessionId.toLowerCase(), commitment.toLowerCase());
    return r && fromRow(r);
  }

  forUser(userId: string, role: InviteRole): Invitation[] {
    return this.db.all("SELECT * FROM invitations WHERE user_id = ? AND role = ? ORDER BY created_at DESC, rowid DESC", userId, role).map(fromRow);
  }

  forSession(sessionId: string, role?: InviteRole): Invitation[] {
    return this.db
      .all(`SELECT * FROM invitations WHERE session_id = ? ${role ? "AND role = ?" : ""} ORDER BY slot, rowid`, ...(role ? [sessionId.toLowerCase(), role] : [sessionId.toLowerCase()]))
      .map(fromRow);
  }

  /** Undangan penelaah sebuah batch. Yang batch-nya ditinggalkan (voided) tidak ikut, kecuali diminta. */
  forBatch(sessionId: string, slot: number, opts: { includeVoided?: boolean } = {}): Invitation[] {
    const voided = opts.includeVoided ? "" : "AND voided_at IS NULL";
    return this.db
      .all(`SELECT * FROM invitations WHERE session_id = ? AND role = 'reviewer' AND slot = ? ${voided} ORDER BY rowid`, sessionId.toLowerCase(), slot)
      .map(fromRow);
  }

  /** Menandai batch ditinggalkan (tidak ada reveal). Undangannya tetap ada supaya orangnya tidak dipilih lagi. */
  voidMany(ids: string[]): void {
    for (const id of ids) this.db.run("UPDATE invitations SET voided_at = ? WHERE id = ? AND voided_at IS NULL", new Date().toISOString(), id);
  }

  unvoidMany(ids: string[]): void {
    for (const id of ids) this.db.run("UPDATE invitations SET voided_at = NULL WHERE id = ?", id);
  }

  /** Membatalkan undangan yang gagal dicatat on-chain, supaya kandidat tidak terhitung "sudah diundang". */
  deleteMany(ids: string[]): void {
    for (const id of ids) this.db.run("DELETE FROM invitations WHERE id = ?", id);
  }

  markAccepted(id: string): void {
    this.db.run("UPDATE invitations SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL", new Date().toISOString(), id);
  }

  saveCriteria(c: SessionCriteria): void {
    this.db.run(
      "INSERT OR REPLACE INTO session_criteria (session_id, revision, fields, criteria_hash, recorded_at) VALUES (?, ?, ?, ?, ?)",
      c.sessionId.toLowerCase(),
      c.revision,
      JSON.stringify(c.fields),
      c.criteriaHash,
      new Date().toISOString(),
    );
  }

  latestCriteria(sessionId: string): SessionCriteria | undefined {
    const r = this.db.get("SELECT * FROM session_criteria WHERE session_id = ? ORDER BY revision DESC LIMIT 1", sessionId.toLowerCase());
    return r && { sessionId: r.session_id as string, revision: r.revision as number, fields: JSON.parse(r.fields as string), criteriaHash: r.criteria_hash as string };
  }
}
