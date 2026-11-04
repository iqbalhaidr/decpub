/**
 * Identitas anggota (P01): pendaftaran commitment di `PermanentAccounts` dan penerbitan
 * kredensial. Secret tidak pernah sampai ke server; server hanya melihat `H(secret)`.
 */
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Address, Hex } from "viem";
import { Role, issueFieldCredential, issueRoleCredential, type RoleValue } from "@decpub/shared";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { ChainService } from "../chain/chain.service.js";
import { UsersRepository, type User } from "./users.repository.js";

export interface Credentials {
  identityCommitment: Hex;
  /** Kredensial peran, kunci = nama peran (Author, Reviewer, Editor). */
  roles: Record<string, Hex>;
  /** Kredensial bidang, kunci = slug bidang. */
  fields: Record<string, Hex>;
}

/** Peran pseudonim yang boleh dipegang tiap jenis akun. */
export function allowedPseudonymRoles(user: Pick<User, "role" | "verifiedFields">): RoleValue[] {
  switch (user.role) {
    case "author":
      return [Role.Author];
    case "reviewer":
      // Penelaah juga boleh menulis (dikecualikan dari naskahnya sendiri saat seleksi, M4),
      // tetapi peran Reviewer baru sah setelah ada bidang terverifikasi.
      return user.verifiedFields.length > 0 ? [Role.Author, Role.Reviewer] : [Role.Author];
    case "editor":
      return [Role.Editor];
    default:
      return [];
  }
}

@Injectable()
export class IdentityService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly users: UsersRepository,
    private readonly chain: ChainService,
  ) {}

  /** Mendaftarkan commitment akun ini on-chain. Sekali per akun. */
  async register(userId: string, commitment: Hex, address: Address): Promise<{ txHash: Hex; blockNumber: number }> {
    const user = this.users.findById(userId);
    if (!user) throw new NotFoundException("Akun tidak ditemukan");
    if (user.role === "admin") throw new BadRequestException("Akun admin tidak memegang identitas pseudonim");
    if (user.identityCommitment) throw new ConflictException("Akun ini sudah mendaftarkan identitas");
    const receipt = await this.chain.registerPermanentAccount(address, commitment);
    this.users.setIdentity(userId, commitment, address);
    return receipt;
  }

  async credentials(userId: string): Promise<Credentials> {
    const user = this.users.findById(userId);
    if (!user) throw new NotFoundException("Akun tidak ditemukan");
    if (!user.identityCommitment) throw new BadRequestException("Daftarkan identitas dulu (POST /me/identity)");
    const commitment = user.identityCommitment as Hex;
    const key = this.config.issuerPrivateKey;
    const roles: Record<string, Hex> = {};
    for (const role of allowedPseudonymRoles(user)) {
      roles[ROLE_LABEL[role]] = await issueRoleCredential(key, commitment, role);
    }
    const fields: Record<string, Hex> = {};
    for (const f of user.verifiedFields) fields[f] = await issueFieldCredential(key, commitment, f);
    return { identityCommitment: commitment, roles, fields };
  }
}

const ROLE_LABEL: Record<RoleValue, string> = { [Role.Author]: "Author", [Role.Reviewer]: "Reviewer", [Role.Editor]: "Editor" };
