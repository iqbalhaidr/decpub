import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ContractsService } from '../contracts/contracts.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import {
  PublicationStatusMap,
  AutomaticCheckResultMap,
  DeskReviewDecisionMap,
  ReviewRecommendationMap,
  ReviewPhaseMap,
  DecisionOutcomeMap,
  mapEnum,
  normalizeHex,
  normalizeAddress,
} from './query.mappers';

@Injectable()
export class QueryService {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly blockchainService: BlockchainService,
  ) {}

  async getContractsStatus() {
    try {
      const blockNumber = await this.blockchainService.publicClient.getBlockNumber();
      const chainId = await this.blockchainService.publicClient.getChainId();

      return {
        status: 'ok',
        rpc: {
          blockNumber: Number(blockNumber),
          chainId,
        },
        contracts: {
          PermanentAccounts: this.contractsService.getAddress('PermanentAccounts'),
          EphemeralAccounts: this.contractsService.getAddress('EphemeralAccounts'),
          PublicationSessions: this.contractsService.getAddress('PublicationSessions'),
          AutomaticChecks: this.contractsService.getAddress('AutomaticChecks'),
          EditorialScreenings: this.contractsService.getAddress('EditorialScreenings'),
          AssignmentProofs: this.contractsService.getAddress('AssignmentProofs'),
          ReviewerSelections: this.contractsService.getAddress('ReviewerSelections'),
          ReviewSubmissions: this.contractsService.getAddress('ReviewSubmissions'),
          ReviewDecisions: this.contractsService.getAddress('ReviewDecisions'),
        },
      };
    } catch (error) {
      throw new BadRequestException('Failed to get contracts status');
    }
  }

  async getSession(sessionIdStr: string) {
    try {
      const sessionId = normalizeHex(sessionIdStr);
      const session = await this.contractsService.read('PublicationSessions', 'getSession', [sessionId]);
      
      if (!session.exists) {
        throw new NotFoundException('Session not found');
      }

      return {
        exists: session.exists,
        sessionId: session.sessionId,
        authorPseudonym: session.authorPseudonym,
        editorPseudonym: session.editorPseudonym,
        originalManuscriptHash: session.originalManuscriptHash,
        anonymizedManuscriptHash: session.anonymizedManuscriptHash,
        metadataHash: session.metadataHash,
        anonymizedManuscriptURI: session.anonymizedManuscriptURI,
        metadataURI: session.metadataURI,
        statusValue: session.status,
        status: mapEnum(session.status, PublicationStatusMap),
        createdAt: Number(session.createdAt),
        updatedAt: Number(session.updatedAt),
        revisionCount: session.revisionCount,
      };
    } catch (e: any) {
      if (e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message);
    }
  }

  async getAutomaticCheckLatest(sessionIdStr: string) {
    try {
      const sessionId = normalizeHex(sessionIdStr);
      const record = await this.contractsService.read('AutomaticChecks', 'getLatestRecord', [sessionId]);
      
      if (!record.exists) {
        throw new NotFoundException('Automatic check record not found');
      }

      return {
        exists: record.exists,
        sessionId: record.sessionId,
        batch: record.batch,
        reportHash: record.reportHash,
        flagsHash: record.flagsHash,
        reportURI: record.reportURI,
        resultValue: record.result,
        result: mapEnum(record.result, AutomaticCheckResultMap),
        recordedAt: Number(record.recordedAt),
      };
    } catch (e: any) {
      if (e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message);
    }
  }

  async getEditorialScreeningLatest(sessionIdStr: string) {
    try {
      const sessionId = normalizeHex(sessionIdStr);
      const record = await this.contractsService.read('EditorialScreenings', 'getLatestRecord', [sessionId]);

      if (!record.exists) {
        throw new NotFoundException('Editorial screening record not found');
      }

      return {
        exists: record.exists,
        sessionId: record.sessionId,
        revision: record.revision,
        editorPseudonym: record.editorPseudonym,
        editorialReportHash: record.editorialReportHash,
        anonymousEditorialReportHash: record.anonymousEditorialReportHash,
        anonymousEditorialReportURI: record.anonymousEditorialReportURI,
        decisionValue: record.decision,
        decision: mapEnum(record.decision, DeskReviewDecisionMap),
        recordedAt: Number(record.recordedAt),
      };
    } catch (e: any) {
      if (e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message);
    }
  }

  async getEditorialScreeningHistory(sessionIdStr: string) {
    try {
      const sessionId = normalizeHex(sessionIdStr);
      const session = await this.contractsService.read('PublicationSessions', 'getSession', [sessionId]);
      
      if (!session.exists) {
        throw new NotFoundException('Session not found');
      }

      const history = [];
      
      
      for (let i = 0; i <= session.revisionCount; i++) {
        const hasRecord = await this.contractsService.read('EditorialScreenings', 'hasRecord', [sessionId, i]);
        if (hasRecord) {
          const record = await this.contractsService.read('EditorialScreenings', 'getRecord', [sessionId, i]);
          history.push({
            exists: record.exists,
            sessionId: record.sessionId,
            revision: record.revision,
            editorPseudonym: record.editorPseudonym,
            editorialReportHash: record.editorialReportHash,
            anonymousEditorialReportHash: record.anonymousEditorialReportHash,
            anonymousEditorialReportURI: record.anonymousEditorialReportURI,
            decisionValue: record.decision,
            decision: mapEnum(record.decision, DeskReviewDecisionMap),
            recordedAt: Number(record.recordedAt),
          });
        }
      }

      return {
        sessionId,
        history,
      };
    } catch (e: any) {
      if (e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message);
    }
  }

  async getReviewerSelectionLatest(sessionIdStr: string) {
    try {
      const sessionId = normalizeHex(sessionIdStr);
      const latestBatchNum = await this.contractsService.read('ReviewerSelections', 'getLatestBatch', [sessionId]);
      
      if (latestBatchNum === 0) {
        throw new NotFoundException('No reviewer selection batches found');
      }

      const batch = await this.contractsService.read('ReviewerSelections', 'getBatch', [sessionId, latestBatchNum]);

      return {
        exists: batch.exists,
        sessionId: batch.sessionId,
        batch: batch.batch,
        criteriaHash: batch.criteriaHash,
        reviewerCount: batch.reviewerCount,
        selectedCount: batch.selectedCount,
        recordedAt: Number(batch.recordedAt),
      };
    } catch (e: any) {
      if (e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message);
    }
  }

  async getAssignmentProofs(sessionIdStr: string) {
    try {
      const sessionId = normalizeHex(sessionIdStr);
      const hasEditorProof = await this.contractsService.read('AssignmentProofs', 'hasEditorAssignmentProof', [sessionId]);
      
      let editorProof = null;
      if (hasEditorProof) {
        const proof = await this.contractsService.read('AssignmentProofs', 'getEditorAssignmentProof', [sessionId]);
        editorProof = {
          exists: proof.exists,
          editorPseudonym: proof.editorPseudonym,
          proofRef: proof.proofRef,
          recordedAt: Number(proof.recordedAt),
        };
      }

      const reviewerProofCount = await this.contractsService.read('AssignmentProofs', 'getReviewerAssignmentProofCount', [sessionId]);

      return {
        editorProof,
        reviewerProofCount: Number(reviewerProofCount),
      };
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
  }

  async getReviewPhase(sessionIdStr: string) {
    try {
      const sessionId = normalizeHex(sessionIdStr);
      const phase = await this.contractsService.read('ReviewSubmissions', 'getReviewPhase', [sessionId]);

      return {
        phaseValue: phase,
        phase: mapEnum(phase, ReviewPhaseMap),
      };
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
  }

  async getReviewSubmissions(sessionIdStr: string, reviewerPseudonymStr: string) {
    try {
      const sessionId = normalizeHex(sessionIdStr);
      const reviewerPseudonym = normalizeAddress(reviewerPseudonymStr);

      const hasCommit = await this.contractsService.read('ReviewSubmissions', 'hasCommit', [sessionId, reviewerPseudonym]);
      const hasReveal = await this.contractsService.read('ReviewSubmissions', 'hasReveal', [sessionId, reviewerPseudonym]);

      let commitRecord = null;
      if (hasCommit) {
        const c = await this.contractsService.read('ReviewSubmissions', 'getCommitRecord', [sessionId, reviewerPseudonym]);
        commitRecord = {
          exists: c.exists,
          assignmentCommitment: c.assignmentCommitment,
          commitHash: c.commitHash,
          revealed: c.revealed,
          committedAt: Number(c.committedAt),
          revealedAt: Number(c.revealedAt),
        };
      }

      let revealRecord = null;
      if (hasReveal) {
        const r = await this.contractsService.read('ReviewSubmissions', 'getRevealRecord', [sessionId, reviewerPseudonym]);
        revealRecord = {
          exists: r.exists,
          assignmentCommitment: r.assignmentCommitment,
          recommendationValue: r.recommendation,
          recommendation: mapEnum(r.recommendation, ReviewRecommendationMap),
          reviewHash: r.reviewHash,
          reviewURI: r.reviewURI,
          nonce: r.nonce,
          revealedAt: Number(r.revealedAt),
        };
      }

      return {
        commitRecord,
        revealRecord,
      };
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
  }

  async getReviewDecision(sessionIdStr: string, batchNumStr: string) {
    try {
      const sessionId = normalizeHex(sessionIdStr);
      const batchNum = parseInt(batchNumStr, 10);

      const hasDecision = await this.contractsService.read('ReviewDecisions', 'hasDecision', [sessionId, batchNum]);
      if (!hasDecision) {
         throw new NotFoundException('Decision not found for batch');
      }

      const decision = await this.contractsService.read('ReviewDecisions', 'getDecision', [sessionId, batchNum]);

      return {
        exists: decision.exists,
        sessionId: decision.sessionId,
        batch: decision.batch,
        reviewerCount: decision.reviewerCount,
        rejectCount: decision.rejectCount,
        majorRevisionCount: decision.majorRevisionCount,
        minorRevisionCount: decision.minorRevisionCount,
        acceptAsIsCount: decision.acceptAsIsCount,
        grayZone: decision.grayZone,
        additionalReviewerCount: decision.additionalReviewerCount,
        outcomeValue: decision.outcome,
        outcome: mapEnum(decision.outcome, DecisionOutcomeMap),
        decidedAt: Number(decision.decidedAt),
      };
    } catch (e: any) {
      if (e instanceof NotFoundException) throw e;
      throw new BadRequestException(e.message);
    }
  }

  async getPublicView(sessionIdStr: string) {
    try {
      const sessionId = normalizeHex(sessionIdStr);

      const [
        sessionReq,
        autoCheckReq,
        editorialReq,
        selectionReq,
        proofsReq,
        phaseReq
      ] = await Promise.allSettled([
        this.getSession(sessionIdStr),
        this.getAutomaticCheckLatest(sessionIdStr),
        this.getEditorialScreeningLatest(sessionIdStr),
        this.getReviewerSelectionLatest(sessionIdStr),
        this.getAssignmentProofs(sessionIdStr),
        this.getReviewPhase(sessionIdStr),
      ]);

      const session = sessionReq.status === 'fulfilled' ? sessionReq.value : null;
      const autoCheck = autoCheckReq.status === 'fulfilled' ? autoCheckReq.value : null;
      const editorial = editorialReq.status === 'fulfilled' ? editorialReq.value : null;
      const selection = selectionReq.status === 'fulfilled' ? selectionReq.value : null;
      const proofs = proofsReq.status === 'fulfilled' ? proofsReq.value : null;
      const phase = phaseReq.status === 'fulfilled' ? phaseReq.value : null;

      let decision = null;
      if (selection && selection.batch) {
        try {
          decision = await this.getReviewDecision(sessionIdStr, String(selection.batch));
        } catch {
          
        }
      }

      return {
        sessionId,
        session,
        automaticCheck: autoCheck,
        editorialScreening: editorial,
        reviewerSelectionBatch: selection,
        assignmentProofs: proofs,
        reviewPhase: phase,
        latestDecision: decision,
      };
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
  }

}
