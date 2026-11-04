/**
 * Proyeksi publik. Hanya data yang memang publik on-chain atau di storage publik: tanpa nama,
 * surel, afiliasi, naskah asli, maupun pemetaan akun-pseudonim. Diperluas M4 (audit trail dari event).
 */
import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Hex } from "viem";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { ChainService } from "../chain/chain.service.js";
import { AuditTrailService } from "./audit-trail.service.js";
import { ProjectionService } from "./projection.service.js";

@ApiTags("Publik")
@Controller()
export class PublicController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly chain: ChainService,
    private readonly projection: ProjectionService,
    private readonly auditTrail: AuditTrailService,
  ) {}

  @ApiOperation({ summary: "Konfigurasi publik: jaringan, alamat kontrak, URL layanan, mode simulasi." })
  @Get("config")
  getConfig() {
    return {
      network: this.config.network,
      chainId: this.config.deployments.chainId,
      contracts: this.config.deployments.contracts,
      storage: this.config.storage,
      zkUrl: this.config.zkUrl,
      escrowRequired: this.config.escrowRequired,
      plagiarismThreshold: this.config.plagiarismThreshold,
      simulations: [
        "[SIMULASI] ZK: attestor memeriksa witness lalu menandatangani",
        "[SIMULASI] storage publik: simulator bergaya IPFS",
        "[SIMULASI] plagiarisme: tumpang tindih n-gram terhadap korpus lokal",
      ],
    };
  }

  @Get("healthz")
  health() {
    return { ok: true, service: "server" };
  }

  @ApiOperation({
    summary: "Sesi publik: status, hash on-chain, P03, putusan editorial, seleksi, fase telaah, keputusan.",
    description: "Isi telaah baru tampil setelah semua penelaah membuka (fase Closed). Tanpa nama, surel, atau pemetaan akun-pseudonim.",
  })
  @Get("public/sessions/:sessionId")
  session(@Param("sessionId") sessionId: string) {
    return this.projection.session(this.hex32(sessionId));
  }

  @ApiOperation({
    summary: "Audit trail: kronologi event on-chain sesi (blok, tx, ringkasan).",
    description: "Dibaca dari log kontrak, bukan snapshot. Dipakai untuk memeriksa bahwa jejak status sesuai diagram alur.",
  })
  @Get("public/sessions/:sessionId/audit-trail")
  async trail(@Param("sessionId") sessionId: string) {
    const id = this.hex32(sessionId);
    const entries = await this.auditTrail.forSession(id);
    return { sessionId: id, entries };
  }

  @ApiOperation({ summary: "Bukti penugasan editor/penelaah (commitment, proofRef, tautan berkas bukti). Tanpa identitas." })
  @Get("public/sessions/:sessionId/assignment-proofs")
  proofs(@Param("sessionId") sessionId: string) {
    return this.projection.assignmentProofs(this.hex32(sessionId));
  }

  private hex32(v: string): Hex {
    if (!/^0x[0-9a-fA-F]{64}$/.test(v)) throw new NotFoundException("sessionId tidak sah");
    return v.toLowerCase() as Hex;
  }
}
