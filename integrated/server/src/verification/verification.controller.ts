import { Body, Controller, Get, Param, ParseIntPipe, Post } from "@nestjs/common";
import { ApiOperation, ApiProperty, ApiTags } from "@nestjs/swagger";
import { IsArray, IsString } from "class-validator";
import { Auth, CurrentUser, type AuthUser } from "../common/auth.js";
import { VerificationService } from "./verification.service.js";

export class FieldRequestDto {
  @ApiProperty({ example: ["ai", "blockchain"] })
  @IsArray()
  @IsString({ each: true })
  fields!: string[];
}

@ApiTags("P01 - Pra-pengajuan: verifikasi bidang")
@Controller()
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @ApiOperation({ summary: "Penelaah meminta verifikasi bidang keahlian." })
  @Auth("reviewer")
  @Post("reviewer/field-requests")
  create(@CurrentUser() u: AuthUser, @Body() dto: FieldRequestDto) {
    return this.verification.createRequest(u.id, dto.fields);
  }

  @ApiOperation({ summary: "Status permintaan verifikasi terakhir milik penelaah." })
  @Auth("reviewer")
  @Get("reviewer/field-requests/me")
  mine(@CurrentUser() u: AuthUser) {
    return this.verification.latestForUser(u.id);
  }

  @ApiOperation({ summary: "Antrian verifikasi bidang (admin)." })
  @Auth("admin")
  @Get("admin/field-requests")
  pending() {
    return this.verification.listPending();
  }

  @Auth("admin")
  @Post("admin/field-requests/:id/approve")
  approve(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.verification.approve(id, u.id);
  }

  @Auth("admin")
  @Post("admin/field-requests/:id/reject")
  reject(@CurrentUser() u: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.verification.reject(id, u.id);
  }
}
