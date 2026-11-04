/**
 * Pembaca keadaan on-chain (sumber kebenaran status). Hanya baca, tanpa akun.
 * Diperluas tiap milestone (editorial, seleksi, telaah, keputusan).
 */
import { Injectable, NotFoundException } from "@nestjs/common";
import type { Address, Hex } from "viem";
import {
  AUTOMATIC_CHECK_RESULT_NAMES,
  DECISION_OUTCOME_NAMES,
  DESK_DECISION_NAMES,
  RECOMMENDATION_NAMES,
  REVIEW_PHASE_NAMES,
  ROLE_NAMES,
  statusName,
} from "@decpub/shared";
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

export interface EditorialView {
  revision: number;
  editorPseudonym: Address;
  editorialReportHash: Hex;
  anonymousEditorialReportHash: Hex;
  anonymousEditorialReportURI: string;
  decisionValue: number;
  decision: string;
  recordedAt: number;
}

export interface BatchView {
  batch: number;
  criteriaHash: Hex;
  reviewerCount: number;
  selectedCount: number;
  recordedAt: number;
}

export interface CommitView {
  reviewerPseudonym: Address;
  assignmentCommitment: Hex;
  commitHash: Hex;
  revealed: boolean;
  committedAt: number;
}

export interface RevealView {
  reviewerPseudonym: Address;
  assignmentCommitment: Hex;
  recommendationValue: number;
  recommendation: string;
  reviewHash: Hex;
  reviewURI: string;
  revealedAt: number;
}

export interface DecisionView {
  batch: number;
  reviewerCount: number;
  rejectCount: number;
  majorRevisionCount: number;
  minorRevisionCount: number;
  acceptAsIsCount: number;
  grayZone: boolean;
  additionalReviewerCount: number;
  outcomeValue: number;
  outcome: string;
  decidedAt: number;
}

const ZERO = "0x0000000000000000000000000000000000000000";

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

  // ------------------------------------------------------------ P05

  async editorialRecord(sessionId: Hex, revision: number): Promise<EditorialView | null> {
    if (!(await this.chain.read<boolean>("EditorialScreenings", "hasRecord", [sessionId, revision]))) return null;
    const r = await this.chain.read<Record<string, unknown>>("EditorialScreenings", "getRecord", [sessionId, revision]);
    return {
      revision: Number(r.revision),
      editorPseudonym: r.editorPseudonym as Address,
      editorialReportHash: r.editorialReportHash as Hex,
      anonymousEditorialReportHash: r.anonymousEditorialReportHash as Hex,
      anonymousEditorialReportURI: r.anonymousEditorialReportURI as string,
      decisionValue: Number(r.decision),
      decision: DESK_DECISION_NAMES[Number(r.decision)] ?? "Unknown",
      recordedAt: Number(r.recordedAt),
    };
  }

  hasReviewerProof(sessionId: Hex, commitment: Hex): Promise<boolean> {
    return this.chain.read<boolean>("AssignmentProofs", "hasReviewerAssignmentProof", [sessionId, commitment]);
  }

  hasEditorProof(sessionId: Hex): Promise<boolean> {
    return this.chain.read<boolean>("AssignmentProofs", "hasEditorAssignmentProof", [sessionId]);
  }

  // ------------------------------------------------------------ P06

  async latestBatchNumber(sessionId: Hex): Promise<number> {
    return Number(await this.chain.read<number>("ReviewerSelections", "getLatestBatch", [sessionId]));
  }

  async batch(sessionId: Hex, batch: number): Promise<BatchView | null> {
    if (!(await this.chain.read<boolean>("ReviewerSelections", "hasBatch", [sessionId, batch]))) return null;
    const b = await this.chain.read<Record<string, unknown>>("ReviewerSelections", "getBatch", [sessionId, batch]);
    return {
      batch: Number(b.batch),
      criteriaHash: b.criteriaHash as Hex,
      reviewerCount: Number(b.reviewerCount),
      selectedCount: Number(b.selectedCount),
      recordedAt: Number(b.recordedAt),
    };
  }

  /** Pseudonim pemilik commitment penugasan, atau null bila belum diikat. */
  async assignmentOwner(sessionId: Hex, commitment: Hex): Promise<Address | null> {
    const a = await this.chain.read<Address>("ActionGateway", "assignmentOwner", [sessionId, commitment]);
    return a.toLowerCase() === ZERO ? null : a;
  }

  // ------------------------------------------------------------ P07

  async reviewPhase(sessionId: Hex): Promise<{ value: number; name: string }> {
    const v = Number(await this.chain.read<number>("ReviewSubmissions", "getReviewPhase", [sessionId]));
    return { value: v, name: REVIEW_PHASE_NAMES[v] ?? "Unknown" };
  }

  hasCommit(sessionId: Hex, pseudonym: Address): Promise<boolean> {
    return this.chain.read<boolean>("ReviewSubmissions", "hasCommit", [sessionId, pseudonym]);
  }

  hasReveal(sessionId: Hex, pseudonym: Address): Promise<boolean> {
    return this.chain.read<boolean>("ReviewSubmissions", "hasReveal", [sessionId, pseudonym]);
  }

  async commitRecord(sessionId: Hex, pseudonym: Address): Promise<CommitView | null> {
    if (!(await this.hasCommit(sessionId, pseudonym))) return null;
    const r = await this.chain.read<Record<string, unknown>>("ReviewSubmissions", "getCommitRecord", [sessionId, pseudonym]);
    return {
      reviewerPseudonym: r.reviewerPseudonym as Address,
      assignmentCommitment: r.assignmentCommitment as Hex,
      commitHash: r.commitHash as Hex,
      revealed: Boolean(r.revealed),
      committedAt: Number(r.committedAt),
    };
  }

  async revealRecord(sessionId: Hex, pseudonym: Address): Promise<RevealView | null> {
    if (!(await this.hasReveal(sessionId, pseudonym))) return null;
    const r = await this.chain.read<Record<string, unknown>>("ReviewSubmissions", "getRevealRecord", [sessionId, pseudonym]);
    return {
      reviewerPseudonym: r.reviewerPseudonym as Address,
      assignmentCommitment: r.assignmentCommitment as Hex,
      recommendationValue: Number(r.recommendation),
      recommendation: RECOMMENDATION_NAMES[Number(r.recommendation)] ?? "Unknown",
      reviewHash: r.reviewHash as Hex,
      reviewURI: r.reviewURI as string,
      revealedAt: Number(r.revealedAt),
    };
  }

  async decision(sessionId: Hex, batch: number): Promise<DecisionView | null> {
    if (!(await this.chain.read<boolean>("ReviewDecisions", "hasDecision", [sessionId, batch]))) return null;
    const d = await this.chain.read<Record<string, unknown>>("ReviewDecisions", "getDecision", [sessionId, batch]);
    return {
      batch: Number(d.batch),
      reviewerCount: Number(d.reviewerCount),
      rejectCount: Number(d.rejectCount),
      majorRevisionCount: Number(d.majorRevisionCount),
      minorRevisionCount: Number(d.minorRevisionCount),
      acceptAsIsCount: Number(d.acceptAsIsCount),
      grayZone: Boolean(d.grayZone),
      additionalReviewerCount: Number(d.additionalReviewerCount),
      outcomeValue: Number(d.outcome),
      outcome: DECISION_OUTCOME_NAMES[Number(d.outcome)] ?? "Unknown",
      decidedAt: Number(d.decidedAt),
    };
  }

  /** Verifikasi bukti ZK di verifier on-chain (view, tanpa gas). */
  verifyProof(kind: number, publicSignals: Hex[], proof: Hex): Promise<boolean> {
    return this.chain.read<boolean>("SimulatedZkVerifier", "verify", [kind, publicSignals, proof]);
  }
}
