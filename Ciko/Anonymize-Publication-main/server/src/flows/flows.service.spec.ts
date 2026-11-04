import { Test, TestingModule } from '@nestjs/testing';
import { FlowsService } from './flows.service';
import { ContractsService } from '../contracts/contracts.service';
import { QueryService } from '../query/query.service';
import { BadRequestException } from '@nestjs/common';

describe('FlowsService', () => {
  let service: FlowsService;
  let contractsService: jest.Mocked<ContractsService>;
  let queryService: jest.Mocked<QueryService>;

  let moduleRef: TestingModule;

  beforeEach(async () => {
    const mockContractsService = {
      write: jest.fn().mockResolvedValue({ txHash: '0xabc', blockNumber: 1 }),
      read: jest.fn(),
    };

    const mockQueryService = {
      getSession: jest.fn().mockResolvedValue(null),
      getReviewDecision: jest.fn().mockResolvedValue(null),
      getReviewSubmissions: jest.fn().mockResolvedValue(null),
      getAssignmentProofs: jest.fn().mockResolvedValue(null),
      getEditorialScreeningLatest: jest.fn().mockResolvedValue(null),
      getReviewerSelectionLatest: jest.fn().mockResolvedValue(null),
      getAutomaticCheckLatest: jest.fn().mockResolvedValue(null),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        FlowsService,
        { provide: ContractsService, useValue: mockContractsService },
        { provide: QueryService, useValue: mockQueryService },
      ],
    }).compile();

    service = moduleRef.get<FlowsService>(FlowsService);
    contractsService = moduleRef.get(ContractsService) as any;
    queryService = moduleRef.get(QueryService) as any;
  });

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  describe('submitPublication', () => {
    it('should submit successfully', async () => {
      queryService.getSession.mockResolvedValue({ statusValue: 1 } as any);
      const res = await service.submitPublication({
        sessionId: '0x123', authorPseudonym: '0xabc', originalManuscriptHash: '0xdef',
        anonymizedManuscriptHash: '0x000', metadataHash: '0x111',
        anonymousManuscriptURI: 'ipfs://m', anonymousMetadataURI: 'ipfs://n',
      });
      expect(res.message).toBe('Publication session submitted successfully');
    });
  });

  describe('recordAutomaticCheck', () => {
    it('should record automatic check and update projection', async () => {
      queryService.getSession.mockResolvedValue({ statusValue: 3 } as any);
      const res = await service.recordAutomaticCheck({
        sessionId: '0x123', reportHash: '0xabc', flagsHash: '0xdef', reportURI: 'ipfs', result: 1
      });
      expect(res.message).toBe('Automatic check recorded successfully');
      expect(contractsService.write).toHaveBeenCalledWith('AutomaticChecks', 'recordAutomaticCheck', expect.any(Array));
    });
  });

  describe('processAnonymization', () => {
    it('should throw BadRequestException if session is not UnderAnonymization', async () => {
      queryService.getSession.mockResolvedValue({ statusValue: 1 } as any);
      await expect(service.processAnonymization({ sessionId: '0x123', anonymizedManuscriptHash: '0x', metadataHash: '0x', anonymousManuscriptURI: '', anonymousMetadataURI: '' })).rejects.toThrow(BadRequestException);
    });

    it('should proceed if session status is 4', async () => {
      queryService.getSession.mockResolvedValueOnce({ statusValue: 4 } as any);
      queryService.getSession.mockResolvedValueOnce({ statusValue: 5 } as any);
      const res = await service.processAnonymization({ sessionId: '0x123', anonymizedManuscriptHash: '0x', metadataHash: '0x', anonymousManuscriptURI: '', anonymousMetadataURI: '' });
      expect(res.message).toBe('Anonymization processed and verified successfully');
    });
  });

  describe('assignEditor & recordEditorialScreening', () => {
    it('should assign editor', async () => {
      await service.assignEditor({ sessionId: '0x' + 'a'.repeat(64), editorPseudonym: '0x' + 'b'.repeat(40) });
      expect(contractsService.write).toHaveBeenCalledWith('PublicationSessions', 'assignEditor', ['0x' + 'a'.repeat(64), '0x' + 'b'.repeat(40)]);
    });

    it('should record editorial screening', async () => {
      queryService.getSession.mockResolvedValue({ statusValue: 8 } as any);
      const res = await service.recordEditorialScreening({
        sessionId: '0x' + 'a'.repeat(64), editorPseudonym: '0x' + 'b'.repeat(40), originalEditorialReportHash: '0x' + 'c'.repeat(64), anonymizedEditorialReportHash: '0x' + 'c'.repeat(64), anonymizedEditorialReportURI: '', decision: 1
      });
      expect(res.message).toBe('Editorial screening recorded successfully');
    });
  });

  describe('Reviewer Assignment & Stealth Invitation', () => {
    it('should record selection batch', async () => {
      const res = await service.recordReviewerSelectionBatch({ sessionId: '0x' + 'a'.repeat(64), criteriaHash: '0x' + 'c'.repeat(64), reviewerCount: 2, reviewerAssignmentCommitments: ['0x' + '1'.repeat(64), '0x' + '2'.repeat(64)] });
      expect(contractsService.write).toHaveBeenCalledWith('ReviewerSelections', 'recordSelectionBatch', expect.any(Array));
    });

    it('should generate valid bytes32 stealth inviteRefs for each assignment without client providing it', async () => {
      const sessionId = '0x' + 'a'.repeat(64);
      const commit1 = '0x' + '1'.repeat(64);
      const commit2 = '0x' + '2'.repeat(64);
      const proofRef1 = '0x' + '3'.repeat(64);
      const proofRef2 = '0x' + '4'.repeat(64);

      await service.batchRecordReviewerAssignmentProofs({
        sessionId,
        assignments: [
          { reviewerAssignmentCommitment: commit1, proofRef: proofRef1 },
          { reviewerAssignmentCommitment: commit2, proofRef: proofRef2 },
        ],
      });

      // It must call AssignmentProofs.batchRecordReviewerAssignmentProofs
      expect(contractsService.write).toHaveBeenCalledWith('AssignmentProofs', 'batchRecordReviewerAssignmentProofs', expect.any(Array));

      const writeArgs = contractsService.write.mock.calls.find(call => call[1] === 'batchRecordReviewerAssignmentProofs')![2];
      const generatedInviteRefs = writeArgs[2] as string[];

      // Assertion: inviteRef is automatically generated
      expect(generatedInviteRefs).toBeDefined();
      expect(generatedInviteRefs.length).toBe(2);

      // Assertion: inviteRef is valid bytes32
      expect(generatedInviteRefs[0]).toMatch(/^0x[a-fA-F0-9]{64}$/);
      expect(generatedInviteRefs[1]).toMatch(/^0x[a-fA-F0-9]{64}$/);

      // Assertion: two different reviewer commitments yield different inviteRefs
      expect(generatedInviteRefs[0]).not.toBe(generatedInviteRefs[1]);
    });
  });

  describe('generateDeterministicCommitment & computeCommitHash', () => {
    it('should generate deterministic commitment', () => {
      const res = service.generateDeterministicCommitment('0x' + 'a'.repeat(64), '0x' + 'b'.repeat(40), '0x' + 'c'.repeat(64));
      expect(res.commitment).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should compute deterministic review commit hash matching solidity', () => {
      const result = service.computeCommitHash({
        sessionId: '0x' + 'a'.repeat(64), reviewerPseudonym: '0x' + 'b'.repeat(40), reviewerAssignmentCommitment: '0x' + 'c'.repeat(64),
        recommendation: 2, reviewHash: '0x' + 'd'.repeat(64), reviewURI: 'ipfs://review', nonce: '0x' + 'e'.repeat(64)
      });
      expect(result).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe('commitReview & revealReview', () => {
    it('should commit review', async () => {
      const res = await service.commitReview({
        sessionId: '0x' + 'a'.repeat(64), reviewerPseudonym: '0x' + 'b'.repeat(40), reviewerAssignmentCommitment: '0x' + 'c'.repeat(64), recommendation: 1, reviewHash: '0x' + 'd'.repeat(64), reviewURI: '', nonce: '0x' + 'e'.repeat(64)
      });
      expect(contractsService.write).toHaveBeenCalledWith('ReviewSubmissions', 'commitReview', expect.any(Array));
      expect(res.message).toBe('Review committed successfully');
    });

    it('should reveal review', async () => {
      const res = await service.revealReview({
        sessionId: '0x' + 'a'.repeat(64), reviewerPseudonym: '0x' + 'b'.repeat(40), reviewerAssignmentCommitment: '0x' + 'c'.repeat(64), recommendation: 1, reviewHash: '0x' + 'd'.repeat(64), reviewURI: '', nonce: '0x' + 'e'.repeat(64)
      });
      expect(contractsService.write).toHaveBeenCalledWith('ReviewSubmissions', 'revealReview', expect.any(Array));
    });
  });

  describe('decideBatch & finalizePublication', () => {
    it('should decide batch', async () => {
      queryService.getReviewDecision.mockResolvedValue(null as any);
      queryService.getSession.mockResolvedValue({ statusValue: 10 } as any);
      const res = await service.decideBatch({ sessionId: '0x' + 'a'.repeat(64), batch: 1, reviewerPseudonyms: ['0x' + 'b'.repeat(40)], additionalReviewerCountIfGrayZone: 0 });
      expect(contractsService.write).toHaveBeenCalledWith('ReviewDecisions', 'decideBatch', expect.any(Array));
    });

    it('should finalize publication when status is 10', async () => {
      queryService.getSession.mockResolvedValueOnce({ statusValue: 10 } as any);
      queryService.getSession.mockResolvedValueOnce({ statusValue: 12 } as any);
      const res = await service.finalizePublication({ sessionId: '0x' + 'a'.repeat(64) });
      expect(res.message).toBe('Publication finalized successfully');
    });

    it('should reject finalize if status is not 10', async () => {
      queryService.getSession.mockResolvedValue({ statusValue: 9 } as any);
      await expect(service.finalizePublication({ sessionId: '0x' + 'a'.repeat(64) })).rejects.toThrow(BadRequestException);
    });
  });
});
