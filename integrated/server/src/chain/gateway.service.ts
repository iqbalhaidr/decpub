/**
 * Pembungkus bertipe untuk `ActionGateway`: satu-satunya pintu server ke kontrak Ciko.
 * Fungsi sistem dikirim operator; aksi bertanda tangan dan ber-ZK hanya diteruskan (relay),
 * server tidak bisa mengubahnya tanpa membatalkan tanda tangan atau bukti.
 */
import { Injectable } from "@nestjs/common";
import type { Address, Hex } from "viem";
import type {
  AutomaticCheckResultValue,
  CommitAction,
  CreateSessionAction,
  PublicationStatusValue,
  RevealAction,
  RoleValue,
  ScreeningAction,
} from "@decpub/shared";
import type { ReviewPhaseValue } from "@decpub/shared";
import { ChainService, type TxReceipt } from "./chain.service.js";

@Injectable()
export class GatewayService {
  constructor(private readonly chain: ChainService) {}

  private send(fn: string, args: readonly unknown[]): Promise<TxReceipt> {
    return this.chain.write("operator", "ActionGateway", fn, args);
  }

  // ---- relay: aksi ber-ZK dan bertanda tangan (siapa saja boleh mengirim, bukti yang mengikat)

  createEphemeralWithProof(p: {
    sessionId: Hex;
    role: RoleValue;
    pseudonym: Address;
    sessionCommitment: Hex;
    nullifier: Hex;
    proof: Hex;
  }): Promise<TxReceipt> {
    return this.send("createEphemeralWithProof", [p.sessionId, p.role, p.pseudonym, p.sessionCommitment, p.nullifier, p.proof]);
  }

  createSessionSigned(action: CreateSessionAction, signature: Hex): Promise<TxReceipt> {
    return this.send("createSessionSigned", [action, signature]);
  }

  /** Mengikat commitment penugasan penelaah ke pseudonim (bukti `ASSIGNMENT_OWNERSHIP`). */
  bindAssignment(sessionId: Hex, assignmentCommitment: Hex, pseudonym: Address, proof: Hex): Promise<TxReceipt> {
    return this.send("bindAssignment", [sessionId, assignmentCommitment, pseudonym, proof]);
  }

  screeningSigned(action: ScreeningAction, signature: Hex): Promise<TxReceipt> {
    return this.send("screeningSigned", [action, signature]);
  }

  commitReviewSigned(action: CommitAction, signature: Hex): Promise<TxReceipt> {
    return this.send("commitReviewSigned", [action, signature]);
  }

  revealReviewSigned(action: RevealAction, signature: Hex): Promise<TxReceipt> {
    return this.send("revealReviewSigned", [action, signature]);
  }

  // ---- aksi sistem (hanya operator)

  assignEditor(sessionId: Hex, editorPseudonym: Address): Promise<TxReceipt> {
    return this.send("assignEditor", [sessionId, editorPseudonym]);
  }

  recordEditorAssignmentProof(sessionId: Hex, editorPseudonym: Address, proofRef: Hex): Promise<TxReceipt> {
    return this.send("recordEditorAssignmentProof", [sessionId, editorPseudonym, proofRef]);
  }

  recordReviewerCriteria(sessionId: Hex, criteriaHash: Hex, reviewerCount: number): Promise<TxReceipt> {
    return this.send("recordReviewerCriteria", [sessionId, criteriaHash, reviewerCount]);
  }

  recordSelectionBatch(sessionId: Hex, criteriaHash: Hex, reviewerCount: number, commitments: Hex[]): Promise<TxReceipt> {
    return this.send("recordSelectionBatch", [sessionId, criteriaHash, reviewerCount, commitments]);
  }

  batchRecordReviewerAssignmentProofs(sessionId: Hex, commitments: Hex[], inviteRefs: Hex[], proofRefs: Hex[]): Promise<TxReceipt> {
    return this.send("batchRecordReviewerAssignmentProofs", [sessionId, commitments, inviteRefs, proofRefs]);
  }

  setReviewPhase(sessionId: Hex, phase: ReviewPhaseValue): Promise<TxReceipt> {
    return this.send("setReviewPhase", [sessionId, phase]);
  }

  decideBatch(sessionId: Hex, batch: number, reviewerPseudonyms: Address[], additionalIfGrayZone: number): Promise<TxReceipt> {
    return this.send("decideBatch", [sessionId, batch, reviewerPseudonyms, additionalIfGrayZone]);
  }

  updateStatus(sessionId: Hex, status: PublicationStatusValue): Promise<TxReceipt> {
    return this.send("updateStatus", [sessionId, status]);
  }

  recordAutomaticCheck(p: {
    sessionId: Hex;
    reportHash: Hex;
    flagsHash: Hex;
    reportURI: string;
    result: AutomaticCheckResultValue;
  }): Promise<TxReceipt> {
    return this.send("recordAutomaticCheck", [p.sessionId, p.reportHash, p.flagsHash, p.reportURI, p.result]);
  }

  // ---- baca

  nonceOf(pseudonym: Address): Promise<bigint> {
    return this.chain.read<bigint>("ActionGateway", "nonces", [pseudonym]);
  }
}
