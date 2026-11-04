import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { Auth, CurrentUser, type AuthUser } from "../common/auth.js";
import { CorpusService } from "../plagiarism/plagiarism.provider.js";
import { SAMPLE_KINDS, generateSamplePdf, isSampleKind } from "../pdf/samples.js";
import { PRIVATE_STORE, type PrivateStore } from "../storage/private-store.js";
import { Inject } from "@nestjs/common";
import { getJson, refs, type IdentityRecord } from "./manuscript-files.js";
import { IntakeDto } from "./manuscripts.dto.js";
import { IntakeService } from "./intake.service.js";
import { ManuscriptsRepository } from "./manuscripts.repository.js";

const MAX_MULTIPART_BYTES = 25 * 1024 * 1024;

@ApiTags("P01-P02 - Naskah")
@Controller("manuscripts")
export class ManuscriptsController {
  constructor(
    private readonly intake: IntakeService,
    private readonly manuscripts: ManuscriptsRepository,
    private readonly corpus: CorpusService,
    @Inject(PRIVATE_STORE) private readonly privateStore: PrivateStore,
  ) {}

  @ApiOperation({
    summary: "Daftar jenis PDF contoh untuk demo.",
    description: SAMPLE_KINDS.join(", "),
  })
  @Get("samples")
  samples() {
    return { kinds: SAMPLE_KINDS };
  }

  @ApiOperation({ summary: "Unduh PDF contoh. `seed` mengubah isi; `title` mengubah judul." })
  @Header("Cache-Control", "no-store")
  @Get("samples/:kind")
  async sample(@Param("kind") kind: string, @Query("title") title: string | undefined, @Query("seed") seed: string | undefined, @Res() res: Response) {
    if (!isSampleKind(kind)) throw new NotFoundException(`Jenis tidak dikenal. Pilihan: ${SAMPLE_KINDS.join(", ")}`);
    const pdf = await generateSamplePdf({
      kind,
      title: title || undefined,
      seed: seed || undefined,
      plagiarizedText: this.corpus.documents[0]?.text,
    });
    res.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="sample-${kind}.pdf"`, "Content-Length": String(pdf.length) });
    res.end(pdf);
  }

  @ApiOperation({
    summary: "P02: unggah naskah. Mengembalikan nilai yang harus ditandatangani pseudonim Author.",
    description:
      "Berkas asli dan identitas penulis disimpan terenkripsi di storage privat. Hash dan CID naskah anonim dihitung sekarang " +
      "(dicatat on-chain saat P02), unggahnya ke storage publik baru di P04.",
  })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: IntakeDto })
  @Auth("author", "reviewer")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_MULTIPART_BYTES } }))
  @Post("intake")
  async upload(@CurrentUser() u: AuthUser, @UploadedFile() file: Express.Multer.File | undefined, @Body() dto: IntakeDto) {
    if (!file) throw new BadRequestException("Berkas (field `file`) wajib");
    const m = await this.intake.intake(u.id, file, dto);
    return {
      manuscriptId: m.id,
      sessionId: m.sessionId,
      originalManuscriptHash: m.originalHash,
      anonymizedManuscriptHash: m.anonymizedHash,
      metadataHash: m.metadataHash,
      anonymizedManuscriptURI: m.anonymizedUri,
      metadataURI: m.metadataUri,
      warnings: m.warnings,
      next: "Buat pseudonim Author (POST /flows/ephemeral-account), tanda tangani CreateSession, lalu POST /flows/submission",
    };
  }

  @ApiOperation({ summary: "Naskah milik saya." })
  @Auth("author", "reviewer")
  @Get()
  mine(@CurrentUser() u: AuthUser) {
    return this.manuscripts.listByOwner(u.id).map(({ ownerUserId: _o, ...rest }) => rest);
  }

  @ApiOperation({
    summary: "Manifes naskah, termasuk identitas penulis: hanya untuk pemilik.",
    description: "Perbaikan atas Ciko: endpoint asalnya (`manuscripts.controller.ts:48-63`) membuka nama dan surel tanpa autentikasi.",
  })
  @Auth("author", "reviewer")
  @Get(":id/manifest")
  async manifest(@CurrentUser() u: AuthUser, @Param("id") id: string) {
    const m = this.manuscripts.byId(id);
    if (!m || m.ownerUserId !== u.id) throw new NotFoundException("Naskah tidak ditemukan");
    const identity = await getJson<IdentityRecord>(this.privateStore, refs.identity(id));
    const { ownerUserId: _o, ...row } = m;
    return { ...row, metadata: identity };
  }
}
