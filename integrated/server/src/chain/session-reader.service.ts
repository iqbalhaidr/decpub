/**
 * Pembaca keadaan on-chain (sumber kebenaran status). Hanya baca, tanpa akun.
 * Diperluas tiap milestone (editorial, seleksi, telaah, keputusan).
 */
import { Injectable, NotFoundException } from "@nestjs/common";
import type { Address, Hex } from "viem";
import { AUTOMATIC_CHECK_RESULT_NAMES, ROLE_NAMES, statusName } from "@decpub/shared";
import { ChainService } from "./chain.service.js";

export interface SessionView {
  sessionId: Hex;
  authorPseudonym: Address;
  editorPseudonym: Address;
  originalManuscriptHash: Hex;
  anonymizedManuscriptHash: Hex;
  metadataHash: Hex;
  anonymizedManuscriptURI: string;
  metadataURI: string;
  statusValue: number;
  status: string;
  createdAt: number;
  updatedAt: number;
  revisionCount: number;
}

export interface CheckView {
  batch: number;
  reportHash: Hex;
  flagsHash: Hex;
  reportURI: string;
  resultValue: number;
  result: string;
  recordedAt: number;
}

export interface EphemeralView {
  exists: boolean;
  role: string;
  sessionId: Hex;
  revoked: boolean;
}

@Injectable()
export class SessionReader {
  constructor(private readonly chain: ChainService) {}

  async sessionExists(sessionId: Hex): Promise<boolean> {
    return this.chain.read<boolean>("PublicationSessions", "exists", [sessionId]);
  }

  async getSession(sessionId: Hex): Promise<SessionView> {
    if (!(await this.sessionExists(sessionId))) throw new NotFoundException("Sesi tidak ditemukan di chain");
    const s = await this.chain.read<Record<string, unknown>>("PublicationSessions", "getSession", [sessionId]);
    return {
      sessionId: s.sessionId as Hex,
      authorPseudonym: s.authorPseudonym as Address,
      editorPseudonym: s.editorPseudonym as Address,
      originalManuscriptHash: s.originalManuscriptHash as Hex,
      anonymizedManuscriptHash: s.anonymizedManuscriptHash as Hex,
      metadataHash: s.metadataHash as Hex,
      anonymizedManuscriptURI: s.anonymizedManuscriptURI as string,
      metadataURI: s.metadataURI as string,
      statusValue: Number(s.status),
      status: statusName(Number(s.status)),
      createdAt: Number(s.createdAt),
      updatedAt: Number(s.updatedAt),
      revisionCount: Number(s.revisionCount),
    };
  }

  async latestCheck(sessionId: Hex): Promise<CheckView | null> {
    const batch = Number(await this.chain.read<number>("AutomaticChecks", "getLatestBatch", [sessionId]));
    if (batch === 0) return null;
    const r = await this.chain.read<Record<string, unknown>>("AutomaticChecks", "getRecord", [sessionId, batch]);
    return {
      batch,
      reportHash: r.reportHash as Hex,
      flagsHash: r.flagsHash as Hex,
      reportURI: r.reportURI as string,
      resultValue: Number(r.result),
      result: AUTOMATIC_CHECK_RESULT_NAMES[Number(r.result)] ?? "Unknown",
      recordedAt: Number(r.recordedAt),
    };
  }

  /** Pseudonim sesi; `exists=false` bila belum dibuat. */
  async ephemeral(pseudonym: Address): Promise<EphemeralView> {
    try {
      const a = await this.chain.read<Record<string, unknown>>("EphemeralAccounts", "getAccount", [pseudonym]);
      return {
        exists: Boolean(a.exists),
        role: ROLE_NAMES[Number(a.role)] ?? "Unknown",
        sessionId: a.sessionId as Hex,
        revoked: Boolean(a.revoked),
      };
    } catch {
      return { exists: false, role: "None", sessionId: ("0x" + "00".repeat(32)) as Hex, revoked: false };
    }
  }
}
