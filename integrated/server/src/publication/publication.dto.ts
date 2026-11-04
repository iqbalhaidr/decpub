import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested } from "class-validator";
import { ADDRESS, HEX32, HEX_BYTES } from "../common/validators.js";

export class DisclosureAttributesDto {
  @IsOptional() @IsString() @MaxLength(300) name?: string;
  @IsOptional() @IsString() @MaxLength(300) affiliation?: string;
  @IsOptional() @IsString() @MaxLength(300) email?: string;
}

export class DisclosureDto {
  @ApiProperty() @Matches(HEX32) sessionId!: string;

  @ApiProperty({ description: "0 = penulis, 2 = editor (opsional). Penelaah tidak pernah bisa diungkap.", enum: [0, 2] })
  @IsIn([0, 2])
  role!: 0 | 2;

  @ApiProperty({ description: "Akun permanen yang didaftarkan pengguna (P01); ditautkan ke pseudonim lewat bukti." })
  @Matches(ADDRESS)
  permanentAccount!: string;

  @ApiProperty({ type: DisclosureAttributesDto, description: "Hanya atribut yang ingin dibuka. Yang tidak diisi tetap rahasia." })
  @ValidateNested()
  @Type(() => DisclosureAttributesDto)
  attributes!: DisclosureAttributesDto;

  @ApiProperty({ description: "Salt acak 32 byte buatan klien; ikut dipublikasikan agar hash atribut bisa diperiksa." })
  @Matches(HEX32)
  salt!: string;

  @ApiPropertyOptional({ description: "Hanya penulis: ikut membuka naskah asli (hash-nya harus sama dengan originalManuscriptHash on-chain)." })
  @IsOptional()
  @IsBoolean()
  includeManuscript?: boolean;

  @ApiProperty({ description: "Bukti SELECTIVE_DISCLOSURE [SIMULASI] dari zk-sim." })
  @Matches(HEX_BYTES)
  proof!: string;
}

export class CommentDto {
  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  text!: string;
}
