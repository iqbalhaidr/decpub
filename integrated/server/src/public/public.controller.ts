/**
 * Proyeksi publik. Hanya data yang memang publik on-chain atau di storage publik: tanpa nama,
 * surel, afiliasi, naskah asli, maupun pemetaan akun-pseudonim. Diperluas M4 (audit trail dari event).
 */
import { Controller, Get, Inject, Param } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Hex } from "viem";
import { gatewayUrl } from "@decpub/shared";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { ChainService } from "../chain/chain.service.js";
import { SessionReader } from "../chain/session-reader.service.js";

@ApiTags("Publik")
@Controller()
export class PublicController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly chain: ChainService,
    private readonly reader: SessionReader,
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

  @ApiOperation({ summary: "Sesi publik: status dan hash on-chain, hasil P03, tautan naskah anonim." })
  @Get("public/sessions/:sessionId")
  async session(@Param("sessionId") sessionId: string) {
    const id = sessionId as Hex;
    const session = await this.reader.getSession(id);
    const automaticCheck = await this.reader.latestCheck(id);
    return {
      session,
      automaticCheck,
      anonymizedManuscriptUrl: gatewayUrl(this.config.storage, session.anonymizedManuscriptURI.replace(/^ipfs:\/\//, "")),
      reportUrl: automaticCheck ? gatewayUrl(this.config.storage, automaticCheck.reportURI.replace(/^ipfs:\/\//, "")) : null,
    };
  }
}
