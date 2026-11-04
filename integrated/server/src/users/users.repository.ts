import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService, type Row } from "../db/database.service.js";
import type { AccountRole } from "../common/auth.js";

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: AccountRole;
  specialities: string[];
  verifiedFields: string[];
  identityCommitment: string | null;
  permanentAddress: string | null;
  identityRegisteredAt: string | null;
  createdAt: string;
}

/** Bentuk aman untuk balasan API: tanpa hash password. */
export type PublicUser = Omit<User, "passwordHash">;

export const toPublicUser = ({ passwordHash: _omit, ...rest }: User): PublicUser => rest;

function fromRow(r: Row): User {
  return {
    id: r.id as string,
    email: r.email as string,
    passwordHash: r.password_hash as string,
    role: r.role as AccountRole,
    specialities: JSON.parse(r.specialities as string),
    verifiedFields: JSON.parse(r.verified_fields as string),
    identityCommitment: (r.identity_commitment as string | null) ?? null,
    permanentAddress: (r.permanent_address as string | null) ?? null,
    identityRegisteredAt: (r.identity_registered_at as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

@Injectable()
export class UsersRepository {
  constructor(private readonly db: DatabaseService) {}

  findById(id: string): User | undefined {
    const r = this.db.get("SELECT * FROM users WHERE id = ?", id);
    return r && fromRow(r);
  }

  findByEmail(email: string): User | undefined {
    const r = this.db.get("SELECT * FROM users WHERE email = ?", email.toLowerCase());
    return r && fromRow(r);
  }

  create(input: {
    email: string;
    passwordHash: string;
    role: AccountRole;
    specialities?: string[];
    verifiedFields?: string[];
  }): User {
    const id = randomUUID();
    this.db.run(
      `INSERT INTO users (id, email, password_hash, role, specialities, verified_fields, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.email.toLowerCase(),
      input.passwordHash,
      input.role,
      JSON.stringify(input.specialities ?? []),
      JSON.stringify(input.verifiedFields ?? []),
      new Date().toISOString(),
    );
    return this.findById(id)!;
  }

  setIdentity(id: string, commitment: string, address: string): void {
    this.db.run(
      "UPDATE users SET identity_commitment = ?, permanent_address = ?, identity_registered_at = ? WHERE id = ?",
      commitment.toLowerCase(),
      address.toLowerCase(),
      new Date().toISOString(),
      id,
    );
  }

  setVerifiedFields(id: string, fields: string[]): void {
    this.db.run("UPDATE users SET verified_fields = ? WHERE id = ?", JSON.stringify(fields), id);
  }

  setSpecialities(id: string, fields: string[]): void {
    this.db.run("UPDATE users SET specialities = ? WHERE id = ?", JSON.stringify(fields), id);
  }

  listByRole(role: AccountRole): User[] {
    return this.db.all("SELECT * FROM users WHERE role = ? ORDER BY created_at, email", role).map(fromRow);
  }
}
