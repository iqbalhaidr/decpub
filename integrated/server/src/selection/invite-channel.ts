/**
 * InviteChannel [SIMULASI]: kanal undangan editor/penelaah (arsitektur bagian 11).
 *
 * Rancangan Ciko mengirim undangan lewat stealth address. Di sini undangan disimpan di kotak
 * masuk server (SQLite) dan hanya bisa dibaca penerimanya lewat JWT. Pengganti nyata: stealth
 * address, cukup mengimplementasikan antarmuka ini.
 */
import { Injectable } from "@nestjs/common";
import { InvitationsRepository, type Invitation, type InviteRole } from "./invitations.repository.js";

export const INVITE_CHANNEL = Symbol("INVITE_CHANNEL");

export interface InviteChannel {
  /** Menyimpan undangan untuk `userRef` (id akun). */
  send(userRef: string, invite: Omit<Invitation, "id" | "createdAt" | "acceptedAt" | "userId">): Promise<Invitation>;
  inbox(userRef: string, role: InviteRole): Promise<Invitation[]>;
}

@Injectable()
export class DbInviteChannel implements InviteChannel {
  constructor(private readonly repo: InvitationsRepository) {}

  async send(userRef: string, invite: Omit<Invitation, "id" | "createdAt" | "acceptedAt" | "userId">): Promise<Invitation> {
    return this.repo.insert({ ...invite, userId: userRef });
  }

  async inbox(userRef: string, role: InviteRole): Promise<Invitation[]> {
    return this.repo.forUser(userRef, role);
  }
}
