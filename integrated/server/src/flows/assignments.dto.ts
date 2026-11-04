import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsIn, IsInt, IsOptional, IsString, Matches, MaxLength, ValidateNested } from "class-validator";
import { MAX_EDITORIAL_CHARS, MAX_REVIEW_CHARS } from "@decpub/shared";
import { ADDRESS, HEX32, HEX_BYTES } from "../common/validators.js";

/** Bukti kepemilikan penugasan (`ASSIGNMENT_OWNERSHIP`): pemegang undangan mengikat commitment ke pseudonimnya. */
export class AssignmentOwnershipDto {
  @Matches(HEX32) sessionId!: string;
  @Matches(HEX32) assignmentCommitment!: string;
  @Matches(ADDRESS) pseudonym!: string;
  @ApiProperty({ description: "Bukti ZK [SIMULASI] jenis ASSIGNMENT_OWNERSHIP dari zk-sim." })
  @Matches(HEX_BYTES)
  proof!: string;
}

const nonce = () => Matches(/^\d+$/);

export class ScreeningActionDto {
  @Matches(HEX32) sessionId!: string;
  @Matches(ADDRESS) pseudonym!: string;
  @Matches(HEX32) editorialReportHash!: string;
  @Matches(HEX32) anonymousEditorialReportHash!: string;
  @IsString() anonymousEditorialReportURI!: string;
  @ApiProperty({ description: "1 ProceedToReviewerSelection, 2 ReviseBeforeReview, 3 DeskReject", enum: [1, 2, 3] })
  @IsIn([1, 2, 3])
  decision!: number;
  @nonce() nonce!: string;
}

export class EditorialReportDto {
  @ApiProperty({ enum: [1, 2, 3] }) @IsIn([1, 2, 3]) decision!: number;
  @ApiProperty({ description: "Komentar editor; masuk laporan publik." })
  @IsString() @MaxLength(MAX_EDITORIAL_CHARS) comments!: string;
  @ApiProperty({ description: "Kriteria bidang penelaah (slug). Dipakai bila keputusan Proceed.", type: [String] })
  @IsArray() @IsString({ each: true }) reviewerFields!: string[];
  @ApiPropertyOptional({ description: "Catatan internal; hanya masuk laporan lengkap di storage privat." })
  @IsOptional() @IsString() @MaxLength(MAX_EDITORIAL_CHARS) privateNotes?: string;
}

export class ScreeningDto {
  @ValidateNested() @Type(() => ScreeningActionDto) action!: ScreeningActionDto;
  @Matches(HEX_BYTES) signature!: string;
  @ValidateNested() @Type(() => EditorialReportDto) report!: EditorialReportDto;
}

/** Aksi commit hanya memuat `commitHash`: rekomendasi dan nonce telaah tidak pernah dikirim ke server sebelum reveal. */
export class CommitActionDto {
  @Matches(HEX32) sessionId!: string;
  @Matches(ADDRESS) pseudonym!: string;
  @Matches(HEX32) assignmentCommitment!: string;
  @Matches(HEX32) commitHash!: string;
  @nonce() nonce!: string;
}

export class CommitDto {
  @ValidateNested() @Type(() => CommitActionDto) action!: CommitActionDto;
  @Matches(HEX_BYTES) signature!: string;
}

export class RevealActionDto {
  @Matches(HEX32) sessionId!: string;
  @Matches(ADDRESS) pseudonym!: string;
  @Matches(HEX32) assignmentCommitment!: string;
  @ApiProperty({ description: "1 Reject, 2 MajorRevision, 3 MinorRevision, 4 AcceptAsIs", enum: [1, 2, 3, 4] })
  @IsInt() @IsIn([1, 2, 3, 4]) recommendation!: number;
  @Matches(HEX32) reviewHash!: string;
  @IsString() reviewURI!: string;
  @Matches(HEX32) reviewNonce!: string;
  @nonce() nonce!: string;
}

export class RevealDto {
  @ValidateNested() @Type(() => RevealActionDto) action!: RevealActionDto;
  @Matches(HEX_BYTES) signature!: string;
  @ApiProperty({ description: "Isi telaah; hash dan CID-nya harus sama dengan yang di-commit." })
  @IsString() @MaxLength(MAX_REVIEW_CHARS) text!: string;
}
