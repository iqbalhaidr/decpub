/** Rincian sesi untuk pemiliknya: status dari chain + laporan P03 dari storage publik. */
import { Inject, Injectable } from "@nestjs/common";
import type { Hex } from "viem";
import type { StorageProvider } from "@decpub/shared";
import { gatewayUrl } from "@decpub/shared";
import { APP_CONFIG, type AppConfig } from "../config/config.js";
import { SessionReader } from "../chain/session-reader.service.js";
import type { CheckReport } from "../manuscripts/checks.service.js";
import type { ManuscriptRow } from "../manuscripts/manuscripts.repository.js";
import { PUBLIC_STORAGE } from "../storage/storage.module.js";

const cidOfUri = (uri: string) => uri.replace(/^ipfs:\/\//, "");

@Injectable()
export class SessionDetailService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PUBLIC_STORAGE) private readonly storage: StorageProvider,
    private readonly reader: SessionReader,
  ) {}

  async forOwner(m: ManuscriptRow) {
    const sessionId = m.sessionId as Hex;
    const submitted = Boolean(m.submittedAt);
    const base = { manuscriptId: m.id, sessionId, title: m.title, journalId: m.journalId, submitted };
    if (!submitted) return { ...base, session: null, automaticCheck: null, report: null, warnings: [] as string[] };

    const [session, check] = await Promise.all([this.reader.getSession(sessionId), this.reader.latestCheck(sessionId)]);
    let report: CheckReport | null = null;
    if (check) {
      try {
        report = JSON.parse(new TextDecoder().decode(await this.storage.get(cidOfUri(check.reportURI)))) as CheckReport;
      } catch {
        report = null; // laporan belum terjangkau; status on-chain tetap benar
      }
    }
    const warnings: string[] = [];
    if (report?.flags.identityExposed) {
      warnings.push(
        `Peringatan identityExposed: ${report.identityExposedFields.join(", ")} masih terbaca di isi naskah anonim. ` +
          "Anonimisasi hanya menghapus metadata dan menambah halaman sampul (batasan B1). Hapus identitas dari isi sebelum mengajukan.",
      );
    }
    return {
      ...base,
      session,
      automaticCheck: check,
      report,
      warnings,
      anonymizedManuscriptUrl: gatewayUrl(this.config.storage, cidOfUri(session.anonymizedManuscriptURI)),
    };
  }
}
