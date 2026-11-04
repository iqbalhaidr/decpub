import { Injectable, BadRequestException } from '@nestjs/common';
import { keccak256, encodePacked, encodeAbiParameters } from 'viem';
import { ContractsService } from '../contracts/contracts.service';
import { QueryService } from '../query/query.service';
import {
  CreateEphemeralAccountDto,
  SubmitPublicationDto,
  RecordAutomaticCheckDto,
  ProcessAnonymizationDto,
  AssignEditorDto,
  RecordEditorialScreeningDto,
  RecordReviewerSelectionDto,
  RecordEditorAssignmentProofDto,
  BatchRecordReviewerAssignmentProofsDto,
  SetReviewPhaseDto,
  CommitReviewDto,
  RevealReviewDto,
  DecideBatchDto,
  FinalizePublicationDto,
} from './flows.dto';

@Injectable()
export class FlowsService {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly queryService: QueryService,
  ) {}

  async createEphemeralAccount(dto: CreateEphemeralAccountDto) {
    const { txHash, blockNumber } = await this.contractsService.write('EphemeralAccounts', 'createEphemeral', [
      dto.pseudonym,
      dto.sessionId,
      dto.role,
      dto.identityCommitment,
    ]);

    return {
      message: 'Ephemeral account created successfully',
      txHash,
      blockNumber,
      data: dto,
    };
  }

  // Implements P02 Pengajuan Manuskrip (F01-F04)
  // Menutup jalur bias B01 (bias afiliasi awal pengarang)
  async submitPublication(dto: SubmitPublicationDto) {
    const { txHash, blockNumber } = await this.contractsService.write('PublicationSessions', 'createSession', [
      dto.sessionId,
      dto.authorPseudonym,
      dto.originalManuscriptHash,
      dto.anonymizedManuscriptHash,
      dto.metadataHash,
      dto.anonymousManuscriptURI,
      dto.anonymousMetadataURI,
    ]);

    const snapshot = await this.queryService.getSession(dto.sessionId);

    return {
      message: 'Publication session submitted successfully',
      txHash,
      blockNumber,
      snapshot,
    };
  }

  // Implements P03 Pengecekan Otomatis Kelengkapan (F05-F06)
  async recordAutomaticCheck(dto: RecordAutomaticCheckDto) {
    const { txHash, blockNumber } = await this.contractsService.write('AutomaticChecks', 'recordAutomaticCheck', [
      dto.sessionId,
      dto.reportHash,
      dto.flagsHash,
      dto.reportURI,
      dto.result,
    ]);

    const checkSnapshot = await this.queryService.getAutomaticCheckLatest(dto.sessionId);
    const sessionSnapshot = await this.queryService.getSession(dto.sessionId);

    return {
      message: 'Automatic check recorded successfully',
      txHash,
      blockNumber,
      snapshot: {
        session: sessionSnapshot,
        automaticCheck: checkSnapshot,
      },
    };
  }

  async getSubmissionFlowState(sessionId: string) {
    const sessionReq = await this.queryService.getSession(sessionId).catch(() => null);
    const autoCheckReq = await this.queryService.getAutomaticCheckLatest(sessionId).catch(() => null);

    return {
      sessionId,
      session: sessionReq,
      automaticCheck: autoCheckReq,
    };
  }

  // Implements P04 Penghapusan Identitas (F07-F08)
  // Menutup jalur bias B02, B03 (paparan identitas pada on-chain record)
  async processAnonymization(dto: ProcessAnonymizationDto) {
    const session = await this.queryService.getSession(dto.sessionId);

    if (session.statusValue !== 4) { 
      throw new BadRequestException(`Session is not ready for anonymization. Current status: ${session.status}`);
    }

    
    const { txHash, blockNumber } = await this.contractsService.write('PublicationSessions', 'updateStatus', [
      dto.sessionId,
      5, 
    ]);

    const updatedSession = await this.queryService.getSession(dto.sessionId);

    return {
      message: 'Anonymization processed and verified successfully',
      txHash,
      blockNumber,
      anonymizationSummary: dto.anonymizationSummary || 'Anonymization completed.',
      proof: {
        originalManuscriptHash: updatedSession.originalManuscriptHash,
        anonymizedManuscriptHash: updatedSession.anonymizedManuscriptHash,
        metadataHash: updatedSession.metadataHash,
        status: updatedSession.status,
      },
    };
  }

  async getAnonymizedArtifactProof(sessionId: string) {
    const session = await this.queryService.getSession(sessionId);

    return {
      sessionId,
      proofOfSeparation: {
        originalManuscriptHash: session.originalManuscriptHash,
        anonymizedManuscriptHash: session.anonymizedManuscriptHash,
        metadataHash: session.metadataHash,
        anonymizedManuscriptURI: session.anonymizedManuscriptURI,
        metadataURI: session.metadataURI,
      },
      status: session.status,
      isAnonymousReady: session.statusValue >= 5, 
    };
  }

  // Implements P05 Penyaringan Editorial (F09)
  async assignEditor(dto: AssignEditorDto) {
    const { txHash, blockNumber } = await this.contractsService.write('PublicationSessions', 'assignEditor', [
      dto.sessionId,
      dto.editorPseudonym,
    ]);

    const sessionSnapshot = await this.queryService.getSession(dto.sessionId);

    return {
      message: 'Editor assigned successfully',
      txHash,
      blockNumber,
      snapshot: sessionSnapshot,
    };
  }

  // Implements P05 Penyaringan Editorial (F10-F11)
  // Menutup jalur bias B04 (bias penyaringan editorial tanpa jejak)
  async recordEditorialScreening(dto: RecordEditorialScreeningDto) {
    const { txHash, blockNumber } = await this.contractsService.write('EditorialScreenings', 'recordEditorialScreening', [
      dto.sessionId,
      dto.editorPseudonym,
      dto.originalEditorialReportHash,
      dto.anonymizedEditorialReportHash,
      dto.anonymizedEditorialReportURI,
      dto.decision,
    ]);

    const screeningSnapshot = await this.queryService.getEditorialScreeningLatest(dto.sessionId);
    const sessionSnapshot = await this.queryService.getSession(dto.sessionId);

    return {
      message: 'Editorial screening recorded successfully',
      txHash,
      blockNumber,
      snapshot: {
        session: sessionSnapshot,
        editorialScreening: screeningSnapshot,
      },
    };
  }

  async getEditorialScreeningLatest(sessionId: string) {
    return this.queryService.getEditorialScreeningLatest(sessionId);
  }

  async getEditorialScreeningHistory(sessionId: string) {
    return this.queryService.getEditorialScreeningHistory(sessionId);
  }

  // Implements P06 Pemilihan Penelaah (F12-F13)
  // Menutup jalur bias B05 (bias penunjukan penelaah sepihak)
  async recordReviewerSelectionBatch(dto: RecordReviewerSelectionDto) {
    const { txHash, blockNumber } = await this.contractsService.write('ReviewerSelections', 'recordSelectionBatch', [
      dto.sessionId,
      dto.criteriaHash,
      dto.reviewerCount,
      dto.reviewerAssignmentCommitments,
    ]);

    const selectionSnapshot = await this.queryService.getReviewerSelectionLatest(dto.sessionId);

    return {
      message: 'Reviewer selection batch recorded successfully',
      txHash,
      blockNumber,
      snapshot: selectionSnapshot,
    };
  }

  // Implements P06 Pemilihan Penelaah (F14)
  async recordEditorAssignmentProof(dto: RecordEditorAssignmentProofDto) {
    const { txHash, blockNumber } = await this.contractsService.write('AssignmentProofs', 'recordEditorAssignmentProof', [
      dto.sessionId,
      dto.editorPseudonym,
      dto.proofRef,
    ]);

    const proofsSnapshot = await this.queryService.getAssignmentProofs(dto.sessionId);

    return {
      message: 'Editor assignment proof recorded successfully',
      txHash,
      blockNumber,
      snapshot: proofsSnapshot,
    };
  }

  // Implements P06 Pemilihan Penelaah (F14)
  async batchRecordReviewerAssignmentProofs(dto: BatchRecordReviewerAssignmentProofsDto) {
    const commitments = dto.assignments.map((a) => a.reviewerAssignmentCommitment);
    const proofRefs = dto.assignments.map((a) => a.proofRef);
    
    // Stealth Invitation Simulation: Automatically generate inviteRef internally.
    // This ignores any inviteRef passed by the client and uses deterministic derivation.
    const inviteRefs = dto.assignments.map((a) =>
      this._generateStealthInviteRef(dto.sessionId, a.reviewerAssignmentCommitment, a.proofRef)
    );

    const { txHash, blockNumber } = await this.contractsService.write('AssignmentProofs', 'batchRecordReviewerAssignmentProofs', [
      dto.sessionId,
      commitments,
      inviteRefs,
      proofRefs,
    ]);

    const proofsSnapshot = await this.queryService.getAssignmentProofs(dto.sessionId);

    return {
      message: 'Batch reviewer assignment proofs recorded successfully',
      txHash,
      blockNumber,
      snapshot: proofsSnapshot,
    };
  }

  generateDeterministicCommitment(sessionId: string, pseudonym: string, salt: string) {
    
    const commitment = keccak256(encodePacked(['bytes32', 'address', 'bytes32'], [sessionId as `0x${string}`, pseudonym as `0x${string}`, salt as `0x${string}`]));
    return {
      commitment,
    };
  }

  async getReviewerSelectionLatest(sessionId: string) {
    return this.queryService.getReviewerSelectionLatest(sessionId);
  }

  async getAssignmentProofs(sessionId: string) {
    return this.queryService.getAssignmentProofs(sessionId);
  }

  async setReviewPhase(dto: SetReviewPhaseDto) {
    const { txHash, blockNumber } = await this.contractsService.write('ReviewSubmissions', 'setReviewPhase', [
      dto.sessionId,
      dto.phase,
    ]);

    return {
      message: 'Review phase updated successfully',
      txHash,
      blockNumber,
      phase: dto.phase,
    };
  }

  computeCommitHash(dto: CommitReviewDto) {
    const { sessionId, reviewerPseudonym, recommendation, reviewHash, reviewURI, nonce } = dto;
    const encoded = encodeAbiParameters(
      [
        { type: 'bytes32' },
        { type: 'address' },
        { type: 'uint8' },
        { type: 'bytes32' },
        { type: 'string' },
        { type: 'bytes32' },
      ],
      [
        sessionId as `0x${string}`,
        reviewerPseudonym as `0x${string}`,
        recommendation,
        reviewHash as `0x${string}`,
        reviewURI,
        nonce as `0x${string}`,
      ]
    );
    return keccak256(encoded);
  }

  // Implements P07 Telaah & Keputusan Akhir (F15)
  // Menutup jalur bias B06 (anchor bias selama proses telaah)
  async commitReview(dto: CommitReviewDto) {
    const commitHash = this.computeCommitHash(dto);
    
    const { txHash, blockNumber } = await this.contractsService.write('ReviewSubmissions', 'commitReview', [
      dto.sessionId,
      dto.reviewerPseudonym,
      dto.reviewerAssignmentCommitment,
      commitHash,
    ]);

    const snapshot = await this.queryService.getReviewSubmissions(dto.sessionId, dto.reviewerPseudonym).catch(() => null);

    return {
      message: 'Review committed successfully',
      commitHash,
      txHash,
      blockNumber,
      snapshot,
    };
  }

  // Implements P07 Telaah & Keputusan Akhir (F16)
  async revealReview(dto: RevealReviewDto) {
    const { txHash, blockNumber } = await this.contractsService.write('ReviewSubmissions', 'revealReview', [
      dto.sessionId,
      dto.reviewerPseudonym,
      dto.reviewerAssignmentCommitment,
      dto.recommendation,
      dto.reviewHash,
      dto.reviewURI,
      dto.nonce,
    ]);

    const snapshot = await this.queryService.getReviewSubmissions(dto.sessionId, dto.reviewerPseudonym).catch(() => null);

    return {
      message: 'Review revealed successfully',
      txHash,
      blockNumber,
      snapshot,
    };
  }

  async getReviewPhase(sessionId: string) {
    const phase = await this.contractsService.read('ReviewSubmissions', 'getReviewPhase', [sessionId]);
    return {
      sessionId,
      phaseValue: phase,
    };
  }

  async getReviewerSubmission(sessionId: string, reviewerPseudonym: string) {
    return this.queryService.getReviewSubmissions(sessionId, reviewerPseudonym);
  }

  // Implements P07 Telaah & Keputusan Akhir (F17-F18)
  async decideBatch(dto: DecideBatchDto) {
    const { txHash, blockNumber } = await this.contractsService.write('ReviewDecisions', 'decideBatch', [
      dto.sessionId,
      dto.batch,
      dto.reviewerPseudonyms,
      dto.additionalReviewerCountIfGrayZone,
    ]);

    const decisionRecord = await this.queryService.getReviewDecision(dto.sessionId, dto.batch.toString()).catch(() => null);
    const sessionSnapshot = await this.queryService.getSession(dto.sessionId).catch(() => null);

    return {
      message: 'Review batch decision recorded successfully',
      txHash,
      blockNumber,
      snapshot: {
        decision: decisionRecord,
        session: sessionSnapshot,
      },
    };
  }

  async getReviewDecision(sessionId: string, batch: number) {
    return this.queryService.getReviewDecision(sessionId, batch.toString());
  }

  async getReviewDecisionSummary(sessionId: string, batch: number) {
    const decision = await this.queryService.getReviewDecision(sessionId, batch.toString());
    const session = await this.queryService.getSession(sessionId);

    return {
      sessionId,
      batch,
      rejectCount: decision.rejectCount,
      majorRevisionCount: decision.majorRevisionCount,
      minorRevisionCount: decision.minorRevisionCount,
      acceptAsIsCount: decision.acceptAsIsCount,
      grayZone: decision.grayZone,
      outcome: decision.outcome,
      reviewerCount: decision.reviewerCount,
      additionalReviewerCountRequested: decision.additionalReviewerCount,
      sessionStatus: session.status,
    };
  }

  // Implements P08 Pascapublikasi (F19-F20)
  async finalizePublication(dto: FinalizePublicationDto) {
    const session = await this.queryService.getSession(dto.sessionId);
    
    
    if (session.statusValue !== 10) {
      throw new BadRequestException(`Cannot finalize publication. Current status is ${session.status}`);
    }

    
    const { txHash, blockNumber } = await this.contractsService.write('PublicationSessions', 'updateStatus', [
      dto.sessionId,
      12, 
    ]);

    const updatedSession = await this.queryService.getSession(dto.sessionId);

    return {
      message: 'Publication finalized successfully',
      txHash,
      blockNumber,
      finalManuscriptURI: dto.finalManuscriptURI || null,
      finalMetadataURI: dto.finalMetadataURI || null,
      snapshot: updatedSession,
    };
  }

  /**
   * Generates a deterministic stealth invitation simulation.
   * This yields a server-derived inviteRef serving as a minimal privacy-preserving routing artifact.
   * It does not claim full stealth address, full network-layer anonymity, or end-to-end unobservability.
   * The actual off-chain delivery channel remains out of scope, and a trusted compute server is assumed.
   * Since this yields a valid bytes32 hex string, no smart contract modification is required.
   */
  private _generateStealthInviteRef(sessionId: string, commitment: string, proofRef: string): string {
    return keccak256(
      encodePacked(
        ['bytes32', 'bytes32', 'bytes32'],
        [sessionId as `0x${string}`, commitment as `0x${string}`, proofRef as `0x${string}`]
      )
    );
  }
}

