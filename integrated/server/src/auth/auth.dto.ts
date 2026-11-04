import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsEmail, IsIn, IsOptional, IsString, Matches, MinLength } from "class-validator";
import { ADDRESS, HEX32 } from "../common/validators.js";

export class RegisterDto {
  @ApiProperty({ example: "author@mail.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 4 })
  @IsString()
  @MinLength(4)
  password!: string;

  @ApiPropertyOptional({ enum: ["author", "reviewer"], default: "author" })
  @IsOptional()
  @IsIn(["author", "reviewer"])
  role?: "author" | "reviewer";

  @ApiPropertyOptional({ description: "Hanya untuk penelaah: bidang yang diminati (minimal satu)." })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  specialities?: string[];
}

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;
}

export class RegisterIdentityDto {
  @ApiProperty({ description: "identityCommitment = H(secret), dihitung di klien. Secret tidak pernah dikirim." })
  @Matches(HEX32)
  identityCommitment!: string;

  @ApiProperty({ description: "Alamat akun permanen (dompet dev turunan secret, atau dompet sendiri)." })
  @Matches(ADDRESS)
  permanentAddress!: string;
}
