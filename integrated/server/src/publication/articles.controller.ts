import { Body, Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Address, Hex } from "viem";
import { Role } from "@decpub/shared";
import { Auth, CurrentUser, type AuthUser } from "../common/auth.js";
import { ArticlesService } from "./articles.service.js";
import { CommentsService } from "./comments.service.js";
import { DisclosureService } from "./disclosure.service.js";
import { CommentDto, DisclosureDto } from "./publication.dto.js";

const hex32 = (v: string): Hex => {
  if (!/^0x[0-9a-fA-F]{64}$/.test(v)) throw new NotFoundException("sessionId tidak sah");
  return v.toLowerCase() as Hex;
};

@ApiTags("P08 - Pasca publikasi")
@Controller()
export class ArticlesController {
  constructor(
    private readonly articles: ArticlesService,
    private readonly comments: CommentsService,
    private readonly disclosure: DisclosureService,
  ) {}

  @ApiOperation({ summary: "Daftar artikel terbit (DOI, judul, jurnal). Nama penulis hanya bila ia membukanya." })
  @Get("articles")
  list() {
    return this.articles.list();
  }

  @ApiOperation({
    summary: "Detail artikel: DOI, hash on-chain, naskah anonim, dan pengungkapan (bila ada) beserta pemeriksaan hash-nya.",
    description: "Penelaah tidak pernah diungkap. Atribut penulis/editor yang dibuka disertai salt, sehingga hash on-chain bisa dihitung ulang.",
  })
  @Get("articles/:sessionId")
  detail(@Param("sessionId") sessionId: string) {
    return this.articles.detail(hex32(sessionId));
  }

  @ApiOperation({ summary: "Open review: laporan editorial dan telaah per batch (pseudonim, rekomendasi, isi, cek hash). Tanpa surel." })
  @Get("articles/:sessionId/open-review")
  openReview(@Param("sessionId") sessionId: string) {
    return this.articles.openReview(hex32(sessionId));
  }

  @ApiOperation({ summary: "Komentar pembaca: hash dari event on-chain digabung isi dari server. Tanpa surel." })
  @Get("articles/:sessionId/comments")
  listComments(@Param("sessionId") sessionId: string) {
    return this.comments.list(hex32(sessionId));
  }

  @ApiOperation({ summary: "Memosting komentar (login, peran apa pun). Hash-nya dicatat di DOIToken oleh relayer." })
  @Auth()
  @Post("articles/:sessionId/comments")
  postComment(@CurrentUser() u: AuthUser, @Param("sessionId") sessionId: string, @Body() dto: CommentDto) {
    return this.comments.post(u.id, hex32(sessionId), dto.text);
  }

  @ApiOperation({ summary: "Kontribusi agregat platform: angka saja, tanpa sesi, orang, atau pseudonim." })
  @Get("stats")
  stats() {
    return this.articles.stats();
  }

  @ApiOperation({ summary: "Kontribusi milik sendiri (jumlah artikel terbit, penyaringan editorial, telaah terkirim)." })
  @Auth()
  @Get("me/contributions")
  contributions(@CurrentUser() u: AuthUser) {
    return this.articles.contributions(u.id);
  }

  @ApiOperation({
    summary: "P08: selective disclosure atas pilihan penulis (atau editor, opsional) setelah terbit.",
    description:
      "Bukti SELECTIVE_DISCLOSURE dibuat klien dari secret (zk-sim). Server memeriksa bukti, keutuhan data privat, dan kebenaran atribut, " +
      "mencatat di PublicationRecords, lalu (penulis) mengunggah naskah asli ke storage publik. Penelaah tidak punya jalur ini.",
  })
  @Auth("author", "reviewer", "editor")
  @Post("flows/disclosure")
  disclose(@CurrentUser() u: AuthUser, @Body() dto: DisclosureDto) {
    return this.disclosure.disclose(u.id, {
      sessionId: hex32(dto.sessionId),
      role: dto.role === 0 ? Role.Author : Role.Editor,
      permanentAccount: dto.permanentAccount as Address,
      attributes: { ...dto.attributes },
      salt: dto.salt as Hex,
      includeManuscript: dto.includeManuscript ?? false,
      proof: dto.proof as Hex,
    });
  }
}
