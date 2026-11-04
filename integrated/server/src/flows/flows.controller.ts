import { Body, Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Address, Hex } from "viem";
import { Auth, CurrentUser, type AuthUser } from "../common/auth.js";
import { GatewayService } from "../chain/gateway.service.js";
import { SessionReader } from "../chain/session-reader.service.js";
import { ManuscriptsRepository } from "../manuscripts/manuscripts.repository.js";
import { SessionDetailService } from "./session-detail.service.js";
import { AdvanceDto, CreateEphemeralDto, RevisionDto, SubmissionDto } from "./flows.dto.js";
import { RevisionService } from "../manuscripts/revision.service.js";
import { PipelineService } from "./pipeline.service.js";
import { ADDRESS } from "../common/validators.js";

@ApiTags("P02-P04 - Pengajuan, pengecekan, anonimisasi")
@Controller("flows")
export class FlowsController {
  constructor(
    private readonly gateway: GatewayService,
    private readonly pipeline: PipelineService,
    private readonly revisions: RevisionService,
    private readonly detail: SessionDetailService,
    private readonly manuscripts: ManuscriptsRepository,
    private readonly reader: SessionReader,
  ) {}

  @ApiOperation({
    summary: "Meneruskan pembuatan pseudonim (Author/Reviewer/Editor) dengan bukti ZK.",
    description:
      "Tanpa login, sengaja: bukti mengikat semua parameter dan tidak ada JWT yang bisa menautkan pseudonim ke akun. " +
      "Server hanya relayer (membayar gas). Nullifier yang sudah dipakai, peran/sesi salah, atau bukti palsu ditolak chain.",
  })
  @Post("ephemeral-account")
  createEphemeral(@Body() dto: CreateEphemeralDto) {
    return this.gateway.createEphemeralWithProof({
      sessionId: dto.sessionId as Hex,
      role: dto.role,
      pseudonym: dto.pseudonym as Address,
      sessionCommitment: dto.sessionCommitment as Hex,
      nullifier: dto.nullifier as Hex,
      proof: dto.proof as Hex,
    });
  }

  @ApiOperation({
    summary: "Nonce gateway sebuah pseudonim (dipakai saat menyusun tanda tangan EIP-712).",
  })
  @Get("nonce/:pseudonym")
  async nonce(@Param("pseudonym") pseudonym: string) {
    if (!new RegExp(ADDRESS).test(pseudonym)) throw new NotFoundException("Alamat tidak sah");
    return { pseudonym, nonce: (await this.gateway.nonceOf(pseudonym as Address)).toString() };
  }

  @ApiOperation({
    summary: "P02: ajukan sesi dengan aksi bertanda tangan pseudonim Author.",
    description: "Server memeriksa isi aksi = hasil intake, meneruskannya ke gateway, lalu (AUTO_ADVANCE) menjalankan P03 dan P04.",
  })
  @Auth("author", "reviewer")
  @Post("submission")
  submit(@CurrentUser() u: AuthUser, @Body() dto: SubmissionDto) {
    return this.pipeline.submit(u.id, dto.manuscriptId, {
      action: {
        sessionId: dto.action.sessionId as Hex,
        pseudonym: dto.action.pseudonym as Address,
        originalManuscriptHash: dto.action.originalManuscriptHash as Hex,
        anonymizedManuscriptHash: dto.action.anonymizedManuscriptHash as Hex,
        metadataHash: dto.action.metadataHash as Hex,
        anonymizedManuscriptURI: dto.action.anonymizedManuscriptURI,
        metadataURI: dto.action.metadataURI,
        nonce: dto.action.nonce,
      },
      signature: dto.signature as Hex,
    });
  }

  @ApiOperation({
    summary: "Revisi naskah: aksi `RecordRevision` bertanda tangan pseudonim Author (setelah intake revisi).",
    description:
      "Server memeriksa isi aksi = hasil intake revisi, mengunggah naskah anonim ke storage publik, lalu meneruskan ke gateway. " +
      "Minor -> AssigningReviewers (penelaah yang sama, pseudonim baru); Major -> UnderEditorialScreening (editor yang sama).",
  })
  @Auth("author", "reviewer")
  @Post("revision")
  revise(@CurrentUser() u: AuthUser, @Body() dto: RevisionDto) {
    const a = dto.action;
    return this.revisions.submit(u.id, dto.manuscriptId, {
      action: {
        sessionId: a.sessionId as Hex,
        pseudonym: a.pseudonym as Address,
        newOriginalManuscriptHash: a.newOriginalManuscriptHash as Hex,
        newAnonymizedManuscriptHash: a.newAnonymizedManuscriptHash as Hex,
        newMetadataHash: a.newMetadataHash as Hex,
        newAnonymizedManuscriptURI: a.newAnonymizedManuscriptURI,
        newMetadataURI: a.newMetadataURI,
        nonce: a.nonce,
      },
      signature: dto.signature as Hex,
    });
  }

  @ApiOperation({
    summary: "Menjalankan langkah sistem yang menunggu (P03/P04). `recheck` mengulang P03 untuk sesi Incomplete.",
  })
  @Auth("author", "reviewer")
  @Post("sessions/:sessionId/advance")
  async advance(@CurrentUser() u: AuthUser, @Param("sessionId") sessionId: string, @Body() dto: AdvanceDto) {
    const m = this.manuscripts.bySession(sessionId);
    if (!m) throw new NotFoundException("Sesi tidak ditemukan");
    const owned = this.pipeline.ownedManuscript(m.id, u.id);
    return this.pipeline.advance(owned, { recheck: dto.recheck });
  }

  @ApiOperation({ summary: "Rincian sesi untuk pemilik: status on-chain, laporan P03 beserta peringatan." })
  @Auth("author", "reviewer")
  @Get("sessions/:sessionId")
  async session(@CurrentUser() u: AuthUser, @Param("sessionId") sessionId: string) {
    const m = this.manuscripts.bySession(sessionId);
    if (!m) throw new NotFoundException("Sesi tidak ditemukan");
    return this.detail.forOwner(this.pipeline.ownedManuscript(m.id, u.id));
  }
}
