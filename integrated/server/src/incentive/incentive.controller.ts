import { Body, Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Address, Hex } from "viem";
import { Auth } from "../common/auth.js";
import { EscrowService } from "../escrow/escrow.service.js";
import { BindNoteDto, ClaimRewardDto, RefundDto, ReputationClaimDto, ReputationTierDto } from "./incentive.dto.js";
import { IncentiveService } from "./incentive.service.js";
import { ReputationService } from "./reputation.service.js";

const hex32 = (v: string): Hex => {
  if (!/^0x[0-9a-fA-F]{64}$/.test(v)) throw new NotFoundException("sessionId tidak sah");
  return v.toLowerCase() as Hex;
};

@ApiTags("Escrow APC dan insentif (Hugo)")
@Controller()
export class IncentiveController {
  constructor(
    private readonly escrow: EscrowService,
    private readonly incentive: IncentiveService,
    private readonly reputation: ReputationService,
  ) {}

  // -------------------------------------------------------------------- escrow

  @ApiOperation({
    summary: "P02: ikat note APC ke sesi (relay `EscrowPool.bindNote`).",
    description:
      "Tanpa login, sengaja: yang dikirim hanya sesi, nullifier, dan bukti NOTE_BIND. Note dan dompet penyetor tidak muncul " +
      "di transaksi ini. Dengan ESCROW_REQUIRED, P03 baru berjalan setelah APC terikat.",
  })
  @Post("escrow/bind")
  bind(@Body() dto: BindNoteDto) {
    return this.escrow.bind({ sessionId: hex32(dto.sessionId), nullifier: dto.nullifier as Hex, proof: dto.proof as Hex });
  }

  @ApiOperation({
    summary: "Refund APC penuh ke alamat baru (relay `EscrowPool.refund`).",
    description:
      "Hanya bila naskah ditolak sebelum ada penelaah (gagal P03, desk reject) atau sesi macet melewati timeout tanpa keputusan. " +
      "Bukti NOTE_REFUND mengikat penerima, jadi relayer tidak bisa mengalihkan dana.",
  })
  @Post("escrow/refund")
  refund(@Body() dto: RefundDto) {
    return this.escrow.refund({ sessionId: hex32(dto.sessionId), recipient: dto.recipient as Address, nullifier: dto.nullifier as Hex, proof: dto.proof as Hex });
  }

  @ApiOperation({ summary: "Status escrow sesi (publik): status, jumlah, boleh refund, boleh dibagikan." })
  @Get("escrow/:sessionId")
  escrowStatus(@Param("sessionId") sessionId: string) {
    return this.escrow.status(hex32(sessionId));
  }

  // ------------------------------------------------------------------- insentif

  @ApiOperation({
    summary: "Insentif sesi (publik): kebijakan terkunci, matriks QoS per pseudonim, bobot, skor, imbalan, status klaim.",
    description: "Laporan QoS diambil dari storage publik dan hash-nya dibandingkan dengan yang tercatat on-chain. Tanpa alamat asli.",
  })
  @Get("incentive/:sessionId")
  incentiveOf(@Param("sessionId") sessionId: string) {
    return this.incentive.view(hex32(sessionId));
  }

  @ApiOperation({
    summary: "Klaim imbalan ke alamat baru (relay `EscrowPool.claimReward`), ditandatangani pseudonim penelaah.",
    description: "Tanpa login: tanda tangan pseudonim mengikat penerima. Server tidak bisa mengalihkan imbalan.",
  })
  @Post("incentive/claim-reward")
  claimReward(@Body() dto: ClaimRewardDto) {
    return this.escrow.claimReward({ sessionId: hex32(dto.sessionId), pseudonym: dto.pseudonym as Address, recipient: dto.recipient as Address, signature: dto.signature as Hex });
  }

  // ------------------------------------------------------------------ reputasi

  @ApiOperation({
    summary: "P06: nyatakan tingkat reputasi (q4) untuk pseudonim penelaah dengan bukti REPUTATION_BUCKET.",
    description: "Server hanya menerima pseudonim dan tingkat; reputationId tidak dikirim. Tanpa pernyataan, q4 = 0.",
  })
  @Post("flows/reviews/reputation-tier")
  tier(@Body() dto: ReputationTierDto) {
    return this.reputation.recordTier({ sessionId: hex32(dto.sessionId), pseudonym: dto.pseudonym as Hex, tier: dto.tier, nullifier: dto.nullifier as Hex, proof: dto.proof as Hex });
  }

  @ApiOperation({
    summary: "P08: ajukan klaim mint reputasi (bukti REPUTATION_CLAIM), menunggu epoch.",
    description: "Klaim tidak memuat sesi maupun pseudonim. Dimint berkelompok dan acak saat admin memicu epoch.",
  })
  @Post("incentive/reputation-claims")
  queueClaim(@Body() dto: ReputationClaimDto) {
    return this.reputation.queueClaim({ reputationId: dto.reputationId as Hex, amount: BigInt(dto.amount), nullifier: dto.nullifier as Hex, proof: dto.proof as Hex });
  }

  @ApiOperation({ summary: "Jumlah klaim reputasi yang menunggu epoch (publik)." })
  @Get("incentive/reputation-claims/pending")
  pending() {
    return this.reputation.pending();
  }

  @ApiOperation({ summary: "Admin: picu epoch reputasi (mint semua klaim yang menunggu, diacak dan berkelompok)." })
  @Auth("admin")
  @Post("admin/epochs/flush")
  flush() {
    return this.reputation.flushEpoch();
  }
}
