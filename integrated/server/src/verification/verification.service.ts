/**
 * Verifikasi bidang penelaah (antrian persetujuan). Port dari `repository/verification.go:58-183`
 * dengan satu perubahan (arsitektur bagian 7): yang menyetujui adalah ADMIN, bukan editor,
 * supaya editor tidak melihat surel kandidat penelaah.
 *
 * Hasil persetujuan, `users.verified_fields`, adalah sumber kandidat seleksi penelaah (P06)
 * dan dasar kredensial bidang (`fieldCredentialDigest`).
 */
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { isFieldSlug } from "@decpub/shared";
import { DatabaseService, type Row } from "../db/database.service.js";
import { UsersRepository } from "../users/users.repository.js";

export type RequestStatus = "pending" | "approved" | "rejected" | "superseded";

export interface FieldRequest {
  id: number;
  userId: string;
  fields: string[];
  status: RequestStatus;
  decidedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Bentuk untuk admin: menyertakan surel pemohon (admin memang berwenang memverifikasi). */
export interface FieldRequestView extends FieldRequest {
  email: string;
}

const fromRow = (r: Row): FieldRequest => ({
  id: r.id as number,
  userId: r.user_id as string,
  fields: JSON.parse(r.fields as string),
  status: r.status as RequestStatus,
  decidedBy: (r.decided_by as string | null) ?? null,
  createdAt: r.created_at as string,
  updatedAt: r.updated_at as string,
});

@Injectable()
export class VerificationService {
  constructor(
    private readonly db: DatabaseService,
    private readonly users: UsersRepository,
  ) {}

  /** Membuat permintaan baru; permintaan pending sebelumnya menjadi `superseded`. */
  createRequest(userId: string, rawFields: string[]): FieldRequest {
    const user = this.users.findById(userId);
    if (!user) throw new NotFoundException("Akun tidak ditemukan");
    if (user.role !== "reviewer") throw new BadRequestException("Hanya penelaah yang meminta verifikasi bidang");
    const fields = [...new Set(rawFields.map((f) => f.trim().toLowerCase()).filter(Boolean))];
    if (fields.length === 0) throw new BadRequestException("Pilih minimal satu bidang");
    const bad = fields.find((f) => !isFieldSlug(f));
    if (bad) throw new BadRequestException(`Bidang tidak dikenal: ${bad}`);

    return this.db.transaction(() => {
      const now = new Date().toISOString();
      this.db.run(
        "UPDATE reviewer_field_requests SET status = 'superseded', updated_at = ? WHERE user_id = ? AND status = 'pending'",
        now,
        userId,
      );
      const { lastInsertRowid } = this.db.run(
        "INSERT INTO reviewer_field_requests (user_id, fields, status, created_at, updated_at) VALUES (?, ?, 'pending', ?, ?)",
        userId,
        JSON.stringify(fields),
        now,
        now,
      );
      this.users.setSpecialities(userId, fields);
      return this.get(lastInsertRowid);
    });
  }

  get(id: number): FieldRequest {
    const r = this.db.get("SELECT * FROM reviewer_field_requests WHERE id = ?", id);
    if (!r) throw new NotFoundException("Permintaan tidak ditemukan");
    return fromRow(r);
  }

  latestForUser(userId: string): FieldRequest | null {
    const r = this.db.get("SELECT * FROM reviewer_field_requests WHERE user_id = ? ORDER BY id DESC LIMIT 1", userId);
    return r ? fromRow(r) : null;
  }

  listPending(): FieldRequestView[] {
    return this.db
      .all("SELECT r.*, u.email FROM reviewer_field_requests r JOIN users u ON u.id = r.user_id WHERE r.status = 'pending' ORDER BY r.id")
      .map((r) => ({ ...fromRow(r), email: r.email as string }));
  }

  /** Menyetujui: `verified_fields` pemohon diganti dengan bidang yang diminta. */
  approve(id: number, adminId: string): FieldRequest {
    const req = this.get(id);
    if (req.status !== "pending") throw new ConflictException(`Permintaan sudah ${req.status}`);
    return this.db.transaction(() => {
      this.db.run(
        "UPDATE reviewer_field_requests SET status = 'approved', decided_by = ?, updated_at = ? WHERE id = ?",
        adminId,
        new Date().toISOString(),
        id,
      );
      this.users.setVerifiedFields(req.userId, req.fields);
      return this.get(id);
    });
  }

  reject(id: number, adminId: string): FieldRequest {
    const req = this.get(id);
    if (req.status !== "pending") throw new ConflictException(`Permintaan sudah ${req.status}`);
    this.db.run(
      "UPDATE reviewer_field_requests SET status = 'rejected', decided_by = ?, updated_at = ? WHERE id = ?",
      adminId,
      new Date().toISOString(),
      id,
    );
    return this.get(id);
  }
}
