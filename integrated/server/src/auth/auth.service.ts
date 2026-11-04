import { BadRequestException, ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { isFieldSlug } from "@decpub/shared";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { signToken, type AccountRole } from "../common/auth.js";
import { UsersRepository, toPublicUser, type PublicUser } from "../users/users.repository.js";
import { VerificationService } from "../verification/verification.service.js";
import { hashPassword, verifyPassword } from "./password.js";

@Injectable()
export class AuthService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly users: UsersRepository,
    private readonly verification: VerificationService,
  ) {}

  register(input: { email: string; password: string; role?: "author" | "reviewer"; specialities?: string[] }): PublicUser {
    const role: AccountRole = input.role ?? "author";
    let specialities: string[] = [];
    if (role === "reviewer") {
      const seen = new Set<string>();
      for (const raw of input.specialities ?? []) {
        const s = raw.trim().toLowerCase();
        if (!s || seen.has(s)) continue;
        if (!isFieldSlug(s)) throw new BadRequestException(`Bidang tidak dikenal: ${s}`);
        seen.add(s);
      }
      specialities = [...seen];
      if (specialities.length === 0) throw new BadRequestException("Penelaah harus memilih minimal satu bidang");
    }
    if (this.users.findByEmail(input.email)) throw new ConflictException("Email sudah terdaftar");
    const user = this.users.create({ email: input.email, passwordHash: hashPassword(input.password), role, specialities });
    // Bidang terverifikasi kosong sampai admin menyetujui permintaan ini (P01/P06).
    if (role === "reviewer") this.verification.createRequest(user.id, specialities);
    return toPublicUser(this.users.findById(user.id)!);
  }

  login(email: string, password: string): { accessToken: string; user: PublicUser } {
    const user = this.users.findByEmail(email);
    // Pesan sama untuk email salah dan password salah.
    if (!user || !verifyPassword(password, user.passwordHash)) throw new UnauthorizedException("Email atau password salah");
    return {
      accessToken: signToken(this.config, { id: user.id, email: user.email, role: user.role }),
      user: toPublicUser(user),
    };
  }
}
