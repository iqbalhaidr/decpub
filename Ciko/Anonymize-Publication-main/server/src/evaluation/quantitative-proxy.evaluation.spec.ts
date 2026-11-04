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
  countSensitiveReviewFields,
  getRichQuantitativeMetrics
} from './quantitative-metrics.util';



describe('Quantitative Proxy Evaluation Suite', () => {
  let flowsService: FlowsService;
  let queryService: QueryService;
  let publicController: PublicController;
  let mockContractsService: any;
  let moduleRef: TestingModule;

  const valid32Hex = '0x' + 'a'.repeat(64);
  const author20Hex = '0x' + 'b'.repeat(40);
  const editor20Hex = '0x' + 'c'.repeat(40);
  const rev1_20Hex = '0x' + '1'.repeat(40);
  const revComm1 = '0x' + 'f'.repeat(64);

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
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('Evaluates Public View of a session', async () => {
    mockContractsService.read.mockResolvedValue({
      exists: true,
      sessionId: valid32Hex,
      authorPseudonym: author20Hex,
      editorPseudonym: editor20Hex,
      originalManuscriptHash: valid32Hex,
      status: 1,
    });

    const publicView = await queryService.getPublicView(valid32Hex);

    const forbiddenCount = countForbiddenIdentityFields(publicView);
    const pseudoCount = countPseudonymousIdentifiers(publicView);

    expect(forbiddenCount).toBe(0);

    expect(pseudoCount).toBeGreaterThanOrEqual(2); 
  });

  it('Evaluates Audit Trail of a session', async () => {
    mockContractsService.read.mockResolvedValue({
      exists: true,
      sessionId: valid32Hex,
      status: 5,
      decision: 2,
      batch: 1,
      reviewerProofCount: 2,
    });

    const trail = await publicController.getAuditTrail(valid32Hex);

    const forbiddenCount = countForbiddenIdentityFields(trail);

    expect(forbiddenCount).toBe(0);

    expect(trail.auditTrail.length).toBeGreaterThanOrEqual(4);
  });

  it('Evaluates Assignment Proof Summary', async () => {
    mockContractsService.read.mockResolvedValueOnce(true); 
    mockContractsService.read.mockResolvedValueOnce({
      exists: true,
      editorPseudonym: editor20Hex,
      proofRef: valid32Hex,
    }); 
    mockContractsService.read.mockResolvedValueOnce(3); 

    const proofs = await queryService.getAssignmentProofs(valid32Hex);
    const setSize = proofs.reviewerProofCount || 1;

    const metrics = getRichQuantitativeMetrics(setSize, proofs);

    expect(metrics.forbiddenIdentityFieldCount).toBe(0);
    expect(metrics.pseudonymousFieldCount).toBe(2); 
    expect(metrics.anonymitySetSize).toBe(3);
    expect(metrics.effectiveAnonymitySetSize).toBe(3);
    
    writeEvaluationArtifact('Quantitative Proxy', 'Evaluates Assignment Proof Summary', metrics);
  });

  it('Evaluates Reviewer Submission (Commit Only vs Reveal)', async () => {

    mockContractsService.read.mockResolvedValueOnce(true); 
    mockContractsService.read.mockResolvedValueOnce(false); 
    mockContractsService.read.mockResolvedValueOnce({
      exists: true,
      assignmentCommitment: revComm1,
      commitHash: valid32Hex,
      revealed: false,
      committedAt: 1000n,
    });

    const commitSubmissions = await queryService.getReviewSubmissions(valid32Hex, rev1_20Hex);

    mockContractsService.read.mockResolvedValueOnce(true); 
    mockContractsService.read.mockResolvedValueOnce(true); 
    mockContractsService.read.mockResolvedValueOnce({
      exists: true,
      assignmentCommitment: revComm1,
      commitHash: valid32Hex,
      revealed: true,
      committedAt: 1000n,
    });
    mockContractsService.read.mockResolvedValueOnce({
      exists: true,
      assignmentCommitment: revComm1,
      recommendation: 4,
      reviewHash: valid32Hex,
      reviewURI: 'ipfs://revealed',
      nonce: valid32Hex,
      revealedAt: 1001n,
    });

    const revealSubmissions = await queryService.getReviewSubmissions(valid32Hex, rev1_20Hex);

    const commitMetrics = getRichQuantitativeMetrics(1, commitSubmissions, {
      supportsFormalEntropy: false,
      reasonNoEntropy: 'Individual reviewer submission tracks exposure delta, not candidate entropy.'
    });

    // Calculate exposure delta using rich metrics
    const revealMetrics = getRichQuantitativeMetrics(1, revealSubmissions, {
      commitPayload: commitSubmissions,
      revealPayload: revealSubmissions,
      supportsFormalEntropy: false,
      reasonNoEntropy: 'Individual reviewer submission tracks exposure delta, not candidate entropy.'
    });

    expect(revealMetrics.sensitiveFieldCount).toBeGreaterThanOrEqual(4); 
    expect(revealMetrics.forbiddenIdentityFieldCount).toBe(0); 
    expect(commitMetrics.forbiddenIdentityFieldCount).toBe(0); 
    expect(revealMetrics.exposureDelta).toBeGreaterThan(0);
    expect(revealMetrics.entropy).toBe(0); // log2(1) = 0
    expect(revealMetrics.effectiveAnonymitySetSize).toBe(1);
    expect(revealMetrics.degreeOfAnonymity).toBe(0);

    writeEvaluationArtifact('Quantitative Proxy', 'Evaluates Reviewer Submission (Commit Only)', commitMetrics);
    writeEvaluationArtifact('Quantitative Proxy', 'Evaluates Reviewer Submission (Reveal Phase)', revealMetrics);
  });

  it('Evaluates Reviewer Selection Batch as Anonymity Set Proxy with Rich Metrics', async () => {
    const dto = {
      sessionId: valid32Hex,
      criteriaHash: valid32Hex,
      reviewerCount: 5,
      additionalReviewerCountIfGrayZone: 2,
      reviewerAssignmentCommitments: [
        '0x1111111111111111111111111111111111111111111111111111111111111111',
        '0x2222222222222222222222222222222222222222222222222222222222222222',
        '0x3333333333333333333333333333333333333333333333333333333333333333'
      ],
    };

    const setSize = dto.reviewerAssignmentCommitments.length;
    
    const metrics = getRichQuantitativeMetrics(setSize, dto, {
      reviewerCount: dto.reviewerCount,
      selectedCount: setSize,
      additionalReviewerCount: dto.additionalReviewerCountIfGrayZone
    });

    expect(metrics.forbiddenIdentityFieldCount).toBe(0);
    expect(metrics.anonymitySetSize).toBe(3);
    
    // Theoretical entropy upper bound is log2(3) ~ 1.58
    expect(metrics.entropy).toBeGreaterThan(1.58);
    expect(metrics.entropy).toBeLessThan(1.59);
    expect(metrics.effectiveAnonymitySetSize).toBe(3);
    expect(metrics.degreeOfAnonymity).toBe(1);

    // Density is selectedCount / reviewerCount = 3 / 5 = 0.6
    expect(metrics.reviewerSelectionDensity).toBe(0.6);

    // Gray-zone additional reviewer ratio = 2 / 5 = 0.4
    expect(metrics.additionalReviewerRatio).toBe(0.4);
    
    console.log('Rich Quantitative Metrics Sample:', metrics);
    writeEvaluationArtifact('Quantitative Proxy', 'Evaluates Reviewer Selection Batch as Anonymity Set Proxy with Rich Metrics', metrics);
  });
});

