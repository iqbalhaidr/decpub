import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

/** Field form multipart `POST /manuscripts/intake` (berkas di field `file`). */
export class IntakeDto {
  @ApiProperty({ description: "ID jurnal dari GET /journals" })
  @Type(() => Number)
  @IsInt()
  journalId!: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  abstract?: string;

  @ApiPropertyOptional({ description: "Dipisah koma" })
  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.split(",").map((s: string) => s.trim()).filter(Boolean) : value))
  @IsString({ each: true })
  keywords?: string[];

  @ApiProperty({ description: "Identitas penulis. Hanya disimpan terenkripsi di storage privat." })
  @IsString()
  @IsNotEmpty()
  authorName!: string;

  @ApiProperty()
  @IsEmail()
  authorEmail!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  affiliation?: string;

  @ApiProperty({ type: "string", format: "binary", required: false })
  file?: unknown;
}
