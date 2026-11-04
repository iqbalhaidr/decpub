import { Test, TestingModule } from '@nestjs/testing';
import { QueryService } from './query.service';
import { ContractsService } from '../contracts/contracts.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('QueryService', () => {
  let service: QueryService;
  let contractsService: any;
  let blockchainService: any;

  let moduleRef: TestingModule;

  beforeEach(async () => {
    contractsService = {
      read: jest.fn(),
      getAddress: jest.fn().mockReturnValue('0x123'),
    };

    blockchainService = {
      publicClient: {
        getBlockNumber: jest.fn(),
        getChainId: jest.fn(),
      },
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        QueryService,
        { provide: ContractsService, useValue: contractsService },
        { provide: BlockchainService, useValue: blockchainService },
      ],
    }).compile();

    service = moduleRef.get<QueryService>(QueryService);
  });

  afterEach(async () => {
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  describe('getSession', () => {
    it('should throw NotFoundException if session does not exist', async () => {
      contractsService.read.mockResolvedValue({ exists: false });
      await expect(service.getSession('0x' + 'a'.repeat(64))).rejects.toThrow(NotFoundException);
    });

    it('should return mapped session data on success', async () => {
      contractsService.read.mockResolvedValue({
        exists: true, sessionId: '0x' + 'a'.repeat(64), status: 1, createdAt: 1000n, updatedAt: 1000n, revisionCount: 0
      });
      const result = await service.getSession('0x' + 'a'.repeat(64));
      expect(result.status).toBe('Submitted');
    });
  });

  describe('getAutomaticCheckLatest', () => {
    it('should throw NotFoundException if no record exists', async () => {
      contractsService.read.mockResolvedValue({ exists: false });
      await expect(service.getAutomaticCheckLatest('0x' + 'a'.repeat(64))).rejects.toThrow(NotFoundException);
    });

    it('should return mapped auto check result', async () => {
      contractsService.read.mockResolvedValue({ exists: true, result: 1, recordedAt: 1000n });
      const res = await service.getAutomaticCheckLatest('0x' + 'a'.repeat(64));
      expect(res.result).toBe('Pass');
    });
  });

  describe('getEditorialScreeningLatest & History', () => {
    it('Latest: should throw NotFoundException if not exists', async () => {
      contractsService.read.mockResolvedValue({ exists: false });
      await expect(service.getEditorialScreeningLatest('0xabc...')).rejects.toThrow(BadRequestException); 
    });

    it('Latest: should map decision', async () => {
      contractsService.read.mockResolvedValue({ exists: true, decision: 1, screenedAt: 1000n });
      const res = await service.getEditorialScreeningLatest('0x' + 'a'.repeat(64));
      expect(res.decision).toBe('ProceedToReviewerSelection');
    });

    it('History: should aggregate based on revision count', async () => {
      
      contractsService.read.mockResolvedValueOnce({ exists: true, revisionCount: 1 });
      
      contractsService.read.mockResolvedValueOnce(true);
      contractsService.read.mockResolvedValueOnce({ exists: true, decision: 2, screenedAt: 1000n });
      
      contractsService.read.mockResolvedValueOnce(true);
      contractsService.read.mockResolvedValueOnce({ exists: true, decision: 1, screenedAt: 2000n });

      const res = await service.getEditorialScreeningHistory('0x' + 'a'.repeat(64));
      expect(res.history.length).toBe(2);
      expect(res.history[0].decision).toBe('ReviseBeforeReview');
      expect(res.history[1].decision).toBe('ProceedToReviewerSelection');
    });
  });

  describe('getReviewerSelectionLatest', () => {
    it('should return selection batch', async () => {
      contractsService.read.mockResolvedValue({ exists: true, batch: 1, reviewerCount: 3, selectedAt: 1000n });
      const res = await service.getReviewerSelectionLatest('0x' + 'a'.repeat(64));
      expect(res.batch).toBe(1);
      expect(res.reviewerCount).toBe(3);
    });
  });

  describe('getAssignmentProofs', () => {
    it('should return proofs object', async () => {
      contractsService.read.mockResolvedValueOnce(true); 
      contractsService.read.mockResolvedValueOnce({ exists: true, editorPseudonym: '0x' + 'b'.repeat(40), proofRef: '0x123', recordedAt: 100n });
      contractsService.read.mockResolvedValueOnce(2n); 

      const res = await service.getAssignmentProofs('0x' + 'a'.repeat(64));
      expect(res.reviewerProofCount).toBe(2);
    });
  });

  describe('getReviewPhase', () => {
    it('should return phase enum mapped', async () => {
      contractsService.read.mockResolvedValue(1); 
      const res = await service.getReviewPhase('0x' + 'a'.repeat(64));
      expect(res.phase).toBe('Commit');
    });
  });

  describe('getReviewSubmissions', () => {
    it('should return commit and reveal records', async () => {
      contractsService.read.mockResolvedValueOnce(true); 
      contractsService.read.mockResolvedValueOnce(true); 
      contractsService.read.mockResolvedValueOnce({ exists: true, recommendation: 0, submittedAt: 10n }); 
      contractsService.read.mockResolvedValueOnce({ exists: true, recommendation: 4, submittedAt: 20n }); 

      const res = await service.getReviewSubmissions('0x' + 'a'.repeat(64), '0x' + 'b'.repeat(40));
      expect(res.commitRecord.exists).toBe(true);
      expect(res.revealRecord.recommendation).toBe('AcceptAsIs');
    });
  });

  describe('getReviewDecision', () => {
    it('should throw NotFoundException if decision is absent', async () => {
      contractsService.read.mockResolvedValueOnce(false); 
      await expect(service.getReviewDecision('0x' + 'a'.repeat(64), '1')).rejects.toThrow(NotFoundException);
    });

    it('should map decision outcome', async () => {
      contractsService.read.mockResolvedValueOnce(true); 
      contractsService.read.mockResolvedValueOnce({ exists: true, outcome: 4, decidedAt: 100n }); 

      const res = await service.getReviewDecision('0x' + 'a'.repeat(64), '1');
      expect(res.outcome).toBe('AcceptAsIs');
    });
  });

  describe('getPublicView', () => {
    it('should aggregate safely ignoring missing pieces', async () => {
      jest.spyOn(service, 'getSession').mockResolvedValue({ sessionId: '0x123' } as any);
      jest.spyOn(service, 'getAutomaticCheckLatest').mockRejectedValue(new NotFoundException());
      jest.spyOn(service, 'getEditorialScreeningLatest').mockRejectedValue(new NotFoundException());
      jest.spyOn(service, 'getReviewerSelectionLatest').mockResolvedValue({ batch: 1 } as any);
      jest.spyOn(service, 'getAssignmentProofs').mockResolvedValue(null as any);
      jest.spyOn(service, 'getReviewPhase').mockResolvedValue(null as any);
      jest.spyOn(service, 'getReviewDecision').mockResolvedValue({ outcome: 'Accepted' } as any);

      const result = await service.getPublicView('0x' + 'a'.repeat(64));
      expect(result.session.sessionId).toBe('0x123');
      expect(result.automaticCheck).toBeNull(); 
      expect(result.latestDecision.outcome).toBe('Accepted');
    });
  });
});
