import { ApiProperty } from "@nestjs/swagger";
import { IsInt, Matches, Max, Min } from "class-validator";
import { ADDRESS, HEX32, HEX_BYTES } from "../common/validators.js";

export class BindNoteDto {
  @Matches(HEX32) sessionId!: string;
  @ApiProperty({ description: "Nullifier ikat note: turunan rahasia note (`noteBindNullifier`). Note tidak disebut." })
  @Matches(HEX32)
  nullifier!: string;
  @ApiProperty({ description: "Bukti ZK [SIMULASI] jenis NOTE_BIND." })
  @Matches(HEX_BYTES)
  proof!: string;
}

export class RefundDto {
  @Matches(HEX32) sessionId!: string;
  @ApiProperty({ description: "Alamat BARU yang belum pernah dipakai; terikat pada bukti." })
  @Matches(ADDRESS)
  recipient!: string;
  @Matches(HEX32) nullifier!: string;
  @ApiProperty({ description: "Bukti ZK [SIMULASI] jenis NOTE_REFUND." })
  @Matches(HEX_BYTES)
  proof!: string;
}

export class ClaimRewardDto {
  @Matches(HEX32) sessionId!: string;
  @Matches(ADDRESS) pseudonym!: string;
  @ApiProperty({ description: "Alamat baru penerima imbalan; terikat pada tanda tangan pseudonim." })
  @Matches(ADDRESS)
  recipient!: string;
  @ApiProperty({ description: "Tanda tangan EIP-712 `ClaimReward` (domain EscrowPool) oleh pseudonim penelaah." })
  @Matches(HEX_BYTES)
  signature!: string;
}

export class ReputationTierDto {
  @Matches(HEX32) sessionId!: string;
  @Matches(ADDRESS) pseudonym!: string;
  @ApiProperty({ minimum: 0, maximum: 4, description: "Tingkat reputasi 0..4 (0, 0,25, 0,5, 0,75, 1)." })
  @IsInt() @Min(0) @Max(4)
  tier!: number;
  @Matches(HEX32) nullifier!: string;
  @ApiProperty({ description: "Bukti ZK [SIMULASI] jenis REPUTATION_BUCKET." })
  @Matches(HEX_BYTES)
  proof!: string;
}

export class ReputationClaimDto {
  @Matches(HEX32) reputationId!: string;
  @ApiProperty({ description: "Jumlah (skala 1e18) berkelipatan 0,25, bilangan bulat desimal." })
  @Matches(/^\d+$/)
  amount!: string;
  @Matches(HEX32) nullifier!: string;
  @ApiProperty({ description: "Bukti ZK [SIMULASI] jenis REPUTATION_CLAIM." })
  @Matches(HEX_BYTES)
  proof!: string;
}
