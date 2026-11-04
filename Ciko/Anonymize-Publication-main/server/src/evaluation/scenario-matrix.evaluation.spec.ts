import { Test, TestingModule } from '@nestjs/testing';
import { FlowsService } from '../flows/flows.service';
import { QueryService } from '../query/query.service';
import { PublicController } from '../public/public.controller';
import { ContractsService } from '../contracts/contracts.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { writeEvaluationArtifact } from './evaluation-artifact.util';
import { 
  calculateQuantitativeMetrics, 
  countForbiddenIdentityFields, 
  countPseudonymousIdentifiers,
  getRichQuantitativeMetrics,
  countSensitiveReviewFields
} from './quantitative-metrics.util';
function assertNoPermanentIdentifiers(obj: any) {
  if (!obj) return;
  const forbiddenKeys = [
    'identityCommitment', 'permanentAccount', 'walletAddress', 
    'realIdentity', 'realName', 'permanentIdentity'
  ];
  const str = JSON.stringify(obj).toLowerCase();
  for (const key of forbiddenKeys) {
    expect(str).not.toContain(key.toLowerCase());
  }
}



describe('Evaluation Scenario Matrix (Qualitative & Quantitative)', () => {
  let flowsService: FlowsService;
  let queryService: QueryService;
  let publicController: PublicController;
  let mockContractsService: any;
  let moduleRef: TestingModule;

  const valid32Hex = '0x' + 'a'.repeat(64);

  beforeAll(async () => {
    mockContractsService = {
      read: jest.fn(),
      write: jest.fn().mockResolvedValue({ txHash: '0xmockTx', blockNumber: 1n }),
      getAddress: jest.fn().mockReturnValue('0xMockAddress'),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        FlowsService,
        QueryService,
        PublicController,
        { provide: ContractsService, useValue: mockContractsService },
        {
          provide: BlockchainService,
          useValue: {
            publicClient: {
              getBlockNumber: jest.fn(),
              getChainId: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    flowsService = moduleRef.get<FlowsService>(FlowsService);
    queryService = moduleRef.get<QueryService>(QueryService);
    publicController = moduleRef.get<PublicController>(PublicController);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  const reviewerScenarios = [
    { label: 'N=1 (Uniform)', count: 1, additionalCount: 0, commitments: ['0x1111111111111111111111111111111111111111111111111111111111111111'] },
    { label: 'N=2 (Uniform)', count: 2, additionalCount: 0, commitments: ['0x1111111111111111111111111111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222222222222222222222222222'] },
    { label: 'N=3 (Uniform)', count: 3, additionalCount: 0, commitments: ['0x1111111111111111111111111111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222222222222222222222222222', '0x3333333333333333333333333333333333333333333333333333333333333333'] },
    { label: 'N=4 (Uniform)', count: 4, additionalCount: 0, commitments: ['0x1111111111111111111111111111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222222222222222222222222222', '0x3333333333333333333333333333333333333333333333333333333333333333', '0x4444444444444444444444444444444444444444444444444444444444444444'] },
    { label: 'Gray-Zone (2 + 1 additional, Uniform)', count: 2, additionalCount: 1, commitments: ['0x1111111111111111111111111111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222222222222222222222222222', '0x4444444444444444444444444444444444444444444444444444444444444444'] },
    { label: 'N=3 Skewed [0.7, 0.2, 0.1]', count: 3, additionalCount: 0, commitments: ['0x1111111111111111111111111111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222222222222222222222222222', '0x3333333333333333333333333333333333333333333333333333333333333333'], distribution: [0.7, 0.2, 0.1] },
    { label: 'N=4 Skewed [0.4, 0.3, 0.2, 0.1]', count: 4, additionalCount: 0, commitments: ['0x1111111111111111111111111111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222222222222222222222222222', '0x3333333333333333333333333333333333333333333333333333333333333333', '0x4444444444444444444444444444444444444444444444444444444444444444'], distribution: [0.4, 0.3, 0.2, 0.1] },
  ];

  describe.each(reviewerScenarios)('Reviewer Scenario: $label', (scenario) => {
    it('Evaluative Notice: Probabilities are mathematical evaluation scenarios for anonymity analysis, not real-world observations.', () => {
      expect(true).toBe(true);
    });

    it('Reviewer Selection Batch creates pseudonym-based array and sets proxy anonymity size', async () => {
      mockContractsService.read.mockResolvedValueOnce(1);
      mockContractsService.read.mockResolvedValueOnce({
        exists: true,
        sessionId: valid32Hex,
        batch: 1,
        criteriaHash: valid32Hex,
        reviewerCount: scenario.count + scenario.additionalCount,
        selectedCount: scenario.count + scenario.additionalCount,
        recordedAt: 1000,
      });

      const dto = {
        sessionId: valid32Hex,
        criteriaHash: valid32Hex,
        reviewerCount: scenario.count + scenario.additionalCount,
        reviewerAssignmentCommitments: scenario.commitments,
      };

      await flowsService.recordReviewerSelectionBatch(dto);
      
      const writeArgs = mockContractsService.write.mock.calls[0];
      expect(writeArgs[2][3]).toEqual(scenario.commitments);
      assertNoPermanentIdentifiers(dto);
      expect(countForbiddenIdentityFields(dto)).toBe(0);
      expect(dto.reviewerAssignmentCommitments.length).toBe(scenario.count + scenario.additionalCount);
    });

    it('Decision summary preserves anonymity set without exposing identities', async () => {
      mockContractsService.read.mockResolvedValueOnce(true); 
      mockContractsService.read.mockResolvedValueOnce({ 
        exists: true,
        batch: 1,
        rejectCount: 0,
        majorRevisionCount: scenario.count,
        minorRevisionCount: 0,
        acceptAsIsCount: 0,
        grayZone: scenario.additionalCount > 0,
        outcome: 2, 
        reviewerCount: scenario.count,
        additionalReviewerCount: scenario.additionalCount
      });
      mockContractsService.read.mockResolvedValueOnce({ exists: true, status: 10 }); 

      const decision = await flowsService.getReviewDecisionSummary(valid32Hex, 1);
      assertNoPermanentIdentifiers(decision);
      expect(decision).not.toHaveProperty('reviewers');
      
      const totalSelected = scenario.count + scenario.additionalCount;
      const metrics = getRichQuantitativeMetrics(
        (scenario as any).distribution || totalSelected, 
        decision, 
        {
          reviewerCount: 5, // mock total pool
          selectedCount: totalSelected,
          additionalReviewerCount: scenario.additionalCount,
          explicitDistribution: (scenario as any).distribution
        }
      );
      
      expect(metrics.forbiddenIdentityFieldCount).toBe(0);
      expect(metrics.reviewerSelectionDensity).toBe(totalSelected / 5);
      expect(metrics.additionalReviewerRatio).toBe(scenario.additionalCount / 5);
      
      // Check mathematically meaningful metric assertions
      expect(metrics.effectiveAnonymitySetSize).toBeLessThanOrEqual(totalSelected);
      expect(metrics.degreeOfAnonymity).toBeGreaterThanOrEqual(0);
      expect(metrics.degreeOfAnonymity).toBeLessThanOrEqual(1);

      if (!(scenario as any).distribution) {
        if (totalSelected > 1) {
          expect(metrics.degreeOfAnonymity).toBe(1);
        } else {
          expect(metrics.degreeOfAnonymity).toBe(0);
        }
      } else {
        expect(metrics.degreeOfAnonymity).toBeLessThan(1);
      }
      
      expect(decision.reviewerCount).toBe(scenario.count);
      expect(decision.additionalReviewerCountRequested).toBe(scenario.additionalCount);

      writeEvaluationArtifact('Scenario Matrix', `Reviewer Scenario: ${scenario.label}`, metrics);
    });
  });

  const phaseScenarios = [
    { label: 'Commit without Reveal', hasCommit: true, hasReveal: false },
    { label: 'Commit with Reveal', hasCommit: true, hasReveal: true },
  ];

  describe.each(phaseScenarios)('Phase Scenario: $label', (scenario) => {
    it('Reviewer Submission projection conditionally exposes review data based on flow phase', async () => {
      mockContractsService.read.mockResolvedValueOnce(scenario.hasCommit);
      mockContractsService.read.mockResolvedValueOnce(scenario.hasReveal);

      if (scenario.hasCommit) {
        mockContractsService.read.mockResolvedValueOnce({
          exists: true, assignmentCommitment: '0xComm', commitHash: valid32Hex,
          revealed: scenario.hasReveal, committedAt: 1000
        });
      }
      
      if (scenario.hasReveal) {
        mockContractsService.read.mockResolvedValueOnce({
          exists: true, assignmentCommitment: '0xComm', recommendation: 4,
          reviewHash: valid32Hex, reviewURI: 'ipfs://rev', nonce: valid32Hex, revealedAt: 1001
        });
      }

      const submission = await queryService.getReviewSubmissions(valid32Hex, '0x1234567890123456789012345678901234567890');
      assertNoPermanentIdentifiers(submission);
      expect(countForbiddenIdentityFields(submission)).toBe(0);
      const sensitiveCount = countSensitiveReviewFields(submission);
      
      if (!scenario.hasReveal) {
        expect(sensitiveCount).toBe(0);
        expect(submission.revealRecord).toBeNull();
      } else {
        expect(sensitiveCount).toBeGreaterThanOrEqual(4);
        expect(submission.revealRecord).toBeDefined();
      }
    });
  });

  const viewScenarios = [
    { label: 'Complete Public View', missingAutoCheck: false, missingEditorial: false },
    { label: 'Partial Public View (missing auto check)', missingAutoCheck: true, missingEditorial: false },
    { label: 'Partial Public View (missing editorial screening)', missingAutoCheck: false, missingEditorial: true },
  ];

  describe.each(viewScenarios)('Public View Scenario: $label', (scenario) => {
    it('Audit trail structurally adapts and preserves anonymity map regardless of missing components', async () => {
      mockContractsService.read.mockResolvedValueOnce({
        exists: true, sessionId: valid32Hex, status: 5
      }); 

      if (scenario.missingAutoCheck) {
        jest.spyOn(queryService, 'getAutomaticCheckLatest').mockRejectedValueOnce(new Error('Not found'));
      }
      if (scenario.missingEditorial) {
        jest.spyOn(queryService, 'getEditorialScreeningLatest').mockRejectedValueOnce(new Error('Not found'));
      }

      
      
      jest.spyOn(queryService, 'getAssignmentProofs').mockResolvedValueOnce({ editorProof: null, reviewerProofCount: 0 });
      jest.spyOn(queryService, 'getReviewerSelectionLatest').mockRejectedValueOnce(new Error('Not found'));
      jest.spyOn(queryService, 'getReviewPhase').mockRejectedValueOnce(new Error('Not found'));
      
      
      mockContractsService.read.mockResolvedValue({
        exists: true,
        sessionId: valid32Hex,
        authorPseudonym: '0x123',
        status: 5,
      });

      const trail = await publicController.getAuditTrail(valid32Hex);
      assertNoPermanentIdentifiers(trail);
      expect(countForbiddenIdentityFields(trail)).toBe(0);

      const autoCheckItem = trail.auditTrail.find((item: any) => item.phase === 'Automatic Checks');
      const editorialItem = trail.auditTrail.find((item: any) => item.phase === 'Editorial Screening');
      
      if (scenario.missingAutoCheck) {
        expect(autoCheckItem.data).toBeNull();
      }
      if (scenario.missingEditorial) {
        expect(editorialItem.data).toBeNull();
      }

      const metrics = getRichQuantitativeMetrics(1, trail, {
        supportsFormalEntropy: false,
        reasonNoEntropy: 'Public audit trail evaluates forbidden identity leakage, not candidate entropy.'
      });
      expect(metrics.forbiddenIdentityFieldCount).toBe(0);
      writeEvaluationArtifact('Scenario Matrix', `Public View Scenario: ${scenario.label}`, metrics);
    });
  });
});
