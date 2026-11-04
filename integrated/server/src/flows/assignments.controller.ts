import { Body, Controller, Get, NotFoundException, Param, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Hex } from "viem";
import { gatewayUrl } from "@decpub/shared";
import { Inject } from "@nestjs/common";
import { Auth, CurrentUser, type AuthUser } from "../common/auth.js";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { SessionReader } from "../chain/session-reader.service.js";
import { JournalsRepository } from "../journals/journals.repository.js";
import { ManuscriptsRepository } from "../manuscripts/manuscripts.repository.js";
import { INVITE_CHANNEL, type InviteChannel } from "../selection/invite-channel.js";
import { AssignmentOwnershipDto, CommitDto, RevealDto, ScreeningDto } from "./assignments.dto.js";
import { EditorialService } from "./editorial.service.js";
import { ProgressService } from "./progress.service.js";
import { ReviewsService } from "./reviews.service.js";

const cidOfUri = (uri: string) => uri.replace(/^ipfs:\/\//, "");

@ApiTags("P05-P07 - Editor dan penelaah")
@Controller()
export class AssignmentsController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(INVITE_CHANNEL) private readonly channel: InviteChannel,
    private readonly editorial: EditorialService,
    private readonly reviews: ReviewsService,
    private readonly progress: ProgressService,
    private readonly reader: SessionReader,
    private readonly manuscripts: ManuscriptsRepository,
    private readonly journals: JournalsRepository,
  ) {}

  @ApiOperation({
    summary: "Kotak masuk undangan (editor atau penelaah, sesuai peran akun).",
    description:
      "Undangan memuat `inviteSalt`, rahasia penerima yang dipakai membuktikan kepemilikan penugasan. " +
      "Tidak memuat identitas penulis; naskah yang dibaca adalah versi anonim di storage publik.",
  })
  @Auth("editor", "reviewer")
  @Get("invitations")
  async inbox(@CurrentUser() u: AuthUser) {
    const role = u.role === "editor" ? "editor" : "reviewer";
    const out = [];
    for (const i of await this.channel.inbox(u.id, role)) {
      const m = this.manuscripts.bySession(i.sessionId);
      const journal = m ? this.journals.get(m.journalId) : undefined;
      let status = "Unknown";
      let anonymizedManuscriptUrl: string | null = null;
      try {
        const s = await this.reader.getSession(i.sessionId as Hex);
        status = s.status;
        anonymizedManuscriptUrl = gatewayUrl(this.config.storage, cidOfUri(s.anonymizedManuscriptURI));
      } catch {
        /* sesi belum terbaca; undangan tetap ditampilkan */
      }
      out.push({
        id: i.id,
        role: i.role,
        sessionId: i.sessionId,
        slot: i.slot,
        inviteSalt: i.inviteSalt,
        assignmentCommitment: i.assignmentCommitment,
        criteria: { fields: i.criteriaFields, hash: i.criteriaHash },
        proofUri: i.proofUri,
        accepted: Boolean(i.acceptedAt),
        sessionStatus: status,
        journal: journal ? { id: journal.id, name: journal.name, category: journal.categorySlug } : null,
        anonymizedManuscriptUrl,
        createdAt: i.createdAt,
      });
    }
    return out;
  }

  @ApiOperation({
    summary: "P05: editor menerima undangan. Tanpa login: bukti kepemilikan undangan yang mengikat.",
    description: "Sistem menugaskan pseudonim Editor (`assignEditor`) dan mencatat bukti penugasan. Pseudonim tidak disimpan server.",
  })
  @Post("flows/assignments/editor")
  acceptEditor(@Body() dto: AssignmentOwnershipDto) {
    return this.editorial.acceptEditor(dto);
  }

  @ApiOperation({
    summary: "P05: putusan penyaringan bertanda tangan pseudonim Editor, beserta laporan editorial.",
    description: "Proceed mencatat kriteria penelaah dan menjalankan P06 (pemilihan penelaah oleh sistem).",
  })
  @Post("flows/editorial-screening")
  screen(@Body() dto: ScreeningDto) {
    return this.editorial.screen(dto);
  }

  @ApiOperation({
    summary: "P06: penelaah mengikat penugasan ke pseudonim Reviewer. Tanpa login.",
    description: "Setelah semua penelaah batch mengikat, sistem membuka UnderReview dan fase Commit.",
  })
  @Post("flows/assignments/bind")
  bind(@Body() dto: AssignmentOwnershipDto) {
    return this.reviews.bind(dto);
  }

  @ApiOperation({
    summary: "P07: commit telaah. Hanya `commitHash` (dihitung klien); rekomendasi tidak dikirim.",
    description: "Setelah semua penelaah commit, sistem membuka fase Reveal.",
  })
  @Post("flows/reviews/commit")
  commit(@Body() dto: CommitDto) {
    return this.reviews.commit(dto);
  }

  @ApiOperation({
    summary: "P07: reveal telaah beserta isinya. Hanya pada fase Reveal.",
    description: "Setelah semua reveal, sistem menutup fase dan memanggil decideBatch; hasil Accept berlanjut ke Published.",
  })
  @Post("flows/reviews/reveal")
  reveal(@Body() dto: RevealDto) {
    return this.reviews.reveal(dto);
  }

  @ApiOperation({
    summary: "Menjalankan langkah sistem berikutnya untuk sebuah sesi (idempoten).",
    description:
      "Tidak butuh login karena hanya mengerjakan kewajiban sistem yang ditentukan keadaan chain. " +
      "Berguna bila AUTO_ADVANCE mati atau untuk memulihkan langkah yang terputus.",
  })
  @Post("system/sessions/:sessionId/progress")
  async progressSession(@Param("sessionId") sessionId: string) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(sessionId)) throw new NotFoundException("sessionId tidak sah");
    return this.progress.advance(sessionId as Hex);
  }
}
