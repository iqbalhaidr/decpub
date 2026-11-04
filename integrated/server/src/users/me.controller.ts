import { Body, Controller, Get, NotFoundException, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Address, Hex } from "viem";
import { Auth, CurrentUser, type AuthUser } from "../common/auth.js";
import { RegisterIdentityDto } from "../auth/auth.dto.js";
import { IdentityService } from "./identity.service.js";
import { UsersRepository, toPublicUser } from "./users.repository.js";

@ApiTags("P01 - Pra-pengajuan: akun")
@Controller("me")
@Auth()
export class MeController {
  constructor(
    private readonly users: UsersRepository,
    private readonly identity: IdentityService,
  ) {}

  @ApiOperation({ summary: "Profil akun yang sedang login." })
  @Get()
  me(@CurrentUser() u: AuthUser) {
    const user = this.users.findById(u.id);
    if (!user) throw new NotFoundException("Akun tidak ditemukan");
    return toPublicUser(user);
  }

  @ApiOperation({
    summary: "Daftarkan identitas anggota: identityCommitment masuk PermanentAccounts (admin-register).",
    description: "Secret dibuat dan disimpan di browser; hanya H(secret) dikirim. Sekali per akun.",
  })
  @Post("identity")
  registerIdentity(@CurrentUser() u: AuthUser, @Body() dto: RegisterIdentityDto) {
    return this.identity.register(u.id, dto.identityCommitment as Hex, dto.permanentAddress as Address);
  }

  @ApiOperation({
    summary: "Kredensial peran dan bidang (tanda tangan penerbit) untuk bukti ZK.",
    description: "Dipakai sebagai witness di klien; tidak pernah muncul on-chain.",
  })
  @Get("credentials")
  credentials(@CurrentUser() u: AuthUser) {
    return this.identity.credentials(u.id);
  }
}
