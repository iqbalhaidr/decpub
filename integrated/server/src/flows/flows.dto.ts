import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsOptional, IsString, Matches, ValidateNested } from "class-validator";
import { ADDRESS, HEX32, HEX_BYTES } from "../common/validators.js";

export class CreateEphemeralDto {
  @ApiProperty({ example: "0x…32 byte" })
  @Matches(HEX32)
  sessionId!: string;

  @ApiProperty({ description: "0 = Author, 1 = Reviewer, 2 = Editor", enum: [0, 1, 2] })
  @IsIn([0, 1, 2])
  role!: 0 | 1 | 2;

  @ApiProperty()
  @Matches(ADDRESS)
  pseudonym!: string;

  @ApiProperty({ description: "H(secret, sesi, peran, slot, pseudonim); bukan commitment identitas permanen." })
  @Matches(HEX32)
  sessionCommitment!: string;

  @ApiProperty()
  @Matches(HEX32)
  nullifier!: string;

  @ApiProperty({ description: "Bukti ZK [SIMULASI] dari zk-sim (tanda tangan attestor)." })
  @Matches(HEX_BYTES)
  proof!: string;
}

export class CreateSessionActionDto {
  @Matches(HEX32) sessionId!: string;
  @Matches(ADDRESS) pseudonym!: string;
  @Matches(HEX32) originalManuscriptHash!: string;
  @Matches(HEX32) anonymizedManuscriptHash!: string;
  @Matches(HEX32) metadataHash!: string;
  @IsString() anonymizedManuscriptURI!: string;
  @IsString() metadataURI!: string;
  @ApiProperty({ description: "Bilangan bulat desimal (nonce gateway pseudonim)." })
  @Matches(/^\d+$/)
  nonce!: string;
}

export class SubmissionDto {
  @ApiProperty({ description: "ID naskah dari POST /manuscripts/intake" })
  @IsString()
  manuscriptId!: string;

  @ApiProperty({ type: CreateSessionActionDto })
  @ValidateNested()
  @Type(() => CreateSessionActionDto)
  action!: CreateSessionActionDto;

  @ApiProperty({ description: "Tanda tangan EIP-712 `CreateSession` oleh pseudonim Author" })
  @Matches(HEX_BYTES)
  signature!: string;
}

export class AdvanceDto {
  @ApiPropertyOptional({ description: "Jalankan ulang P03 untuk sesi berstatus Incomplete." })
  @IsOptional()
  @IsBoolean()
  recheck?: boolean;
}
