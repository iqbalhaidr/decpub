import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { ContractsService } from './../src/contracts/contracts.service';
import { BlockchainService } from './../src/blockchain/blockchain.service';

function assertNoPermanentIdentifiers(obj: any) {
  if (!obj) return;
  const forbiddenKeys = [
    'identityCommitment', 
    'permanentAccount', 
    'walletAddress', 
    'realIdentity', 
    'realName', 
    'permanentIdentity',
    'email',
    'phoneNumber'
  ];
  
  const str = JSON.stringify(obj).toLowerCase();
  for (const key of forbiddenKeys) {
    expect(str).not.toContain(key.toLowerCase());
  }
}

describe('End-to-end multi-role flow from submission to finalized publication (server layer)', () => {
  let app: INestApplication;
  let mockContractsService: any;
  let mockSessionStatus = 1;

  const valid32Hex = '0x' + 'a'.repeat(64);
  const valid20Hex = '0x' + 'b'.repeat(40);
  const author20Hex = '0x' + 'a'.repeat(40);
  const editor20Hex = '0x' + 'e'.repeat(40);
  const rev1_20Hex = '0x' + '1'.repeat(40);

  beforeAll(async () => {
    
    mockContractsService = {
      write: jest.fn().mockResolvedValue({ txHash: '0xmockTx', blockNumber: 1 }),
      read: jest.fn().mockImplementation((contractName: string, methodName: string, args: any[]) => {
        
        if (contractName === 'SessionStorage' && methodName === 'getSession') {
          return Promise.resolve({
            exists: true,
            sessionId: valid32Hex,
            authorPseudonym: author20Hex,
            editorPseudonym: editor20Hex,
            originalManuscriptHash: valid32Hex,
            status: mockSessionStatus,
          });
        }
        
        
        
        
        if (contractName === 'AutomaticChecks' && methodName === 'getLatestCheck') {
          return Promise.resolve({ exists: true, sessionId: valid32Hex, passed: true, score: 95, checkedAt: 1000 });
        }
        if (contractName === 'EditorialScreenings' && methodName === 'getLatestScreening') {
          return Promise.resolve({ exists: true, sessionId: valid32Hex, decision: 1, screenedAt: 1001 });
        }
        if (contractName === 'ReviewerSelections' && methodName === 'getLatestBatch') {
          return Promise.resolve(1);
        }
        if (contractName === 'ReviewerSelections' && methodName === 'getBatch') {
          return Promise.resolve({ exists: true, sessionId: valid32Hex, batch: 1, criteriaHash: valid32Hex, reviewerCount: 2, selectedCount: 2, recordedAt: 1002 });
        }
        if (contractName === 'AssignmentProofs' && methodName === 'hasEditorProof') {
          return Promise.resolve(true);
        }
        if (contractName === 'AssignmentProofs' && methodName === 'getEditorAssignmentProof') {
          return Promise.resolve({ exists: true, editorPseudonym: editor20Hex, proofRef: valid32Hex, assignedAt: 1003 });
        }
        if (contractName === 'AssignmentProofs' && methodName === 'getReviewerAssignmentProofCount') {
          return Promise.resolve(2);
        }
        if (contractName === 'ReviewPhases' && methodName === 'hasReviewPhase') {
          return Promise.resolve(true);
        }
        if (contractName === 'ReviewPhases' && methodName === 'getReviewPhase') {
          return Promise.resolve({ exists: true, sessionId: valid32Hex, startBlock: 1n, endBlock: 100n, status: 2 });
        }
        if (contractName === 'ReviewSubmissions' && methodName === 'hasCommit') {
          return Promise.resolve(true);
        }
        if (contractName === 'ReviewSubmissions' && methodName === 'getReviewCommit') {
          return Promise.resolve({ exists: true, assignmentCommitment: valid32Hex, commitHash: valid32Hex, revealed: true, committedAt: 1004 });
        }
        if (contractName === 'ReviewSubmissions' && methodName === 'hasReveal') {
          return Promise.resolve(true);
        }
        if (contractName === 'ReviewSubmissions' && methodName === 'getReviewReveal') {
          return Promise.resolve({ exists: true, assignmentCommitment: valid32Hex, recommendation: 4, reviewHash: valid32Hex, reviewURI: 'ipfs://rev', nonce: valid32Hex, revealedAt: 1005 });
        }
        if (contractName === 'ReviewDecisions' && methodName === 'hasDecision') {
          return Promise.resolve(true);
        }
        if (contractName === 'ReviewDecisions' && methodName === 'getDecision') {
          return Promise.resolve({ exists: true, sessionId: valid32Hex, batch: 1, reviewerCount: 2, rejectCount: 0, majorRevisionCount: 0, minorRevisionCount: 0, acceptAsIsCount: 2, grayZone: false, additionalReviewerCount: 0, outcome: 1, decidedAt: 1006 });
        }
        
        
        if (methodName.startsWith('has')) return Promise.resolve(false);
        
        
        return Promise.resolve({ exists: true, status: mockSessionStatus, statusValue: mockSessionStatus });
      }),
      getAddress: jest.fn().mockReturnValue('0xMockAddress'),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule], 
    })
      .overrideProvider(ContractsService)
      .useValue(mockContractsService)
      .overrideProvider(BlockchainService)
      .useValue({
        publicClient: {
          getBlockNumber: jest.fn().mockResolvedValue(100n),
          getChainId: jest.fn().mockResolvedValue(31337),
        },
        walletClient: {},
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      })
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('Orchestrates multi-role workflows from ephemeral account to finalized audit trail', async () => {
    
    await request(app.getHttpServer())
      .post('/flows/ephemeral-account')
      .send({ pseudonym: author20Hex, sessionId: valid32Hex, role: 0, identityCommitment: valid32Hex })
      .expect(201);
      
    
    await request(app.getHttpServer())
      .post('/flows/submission')
      .send({
        sessionId: valid32Hex,
        authorPseudonym: author20Hex,
        originalManuscriptHash: valid32Hex,
        anonymizedManuscriptHash: valid32Hex,
        metadataHash: valid32Hex,
        anonymousManuscriptURI: 'ipfs://m',
        anonymousMetadataURI: 'ipfs://n',
      })
      .expect(201);

    
    mockSessionStatus = 2; 
    await request(app.getHttpServer())
      .post('/flows/automatic-checks')
      .send({
        sessionId: valid32Hex,
        reportHash: valid32Hex,
        flagsHash: valid32Hex,
        reportURI: 'ipfs://report',
        result: 1,
      })
      .expect(201);

    
    mockSessionStatus = 4; 
    await request(app.getHttpServer())
      .post('/flows/anonymization')
      .send({
        sessionId: valid32Hex,
        anonymizedManuscriptHash: valid32Hex,
        metadataHash: valid32Hex,
        anonymousManuscriptURI: 'ipfs://m2',
        anonymousMetadataURI: 'ipfs://n2',
      })
      .expect(201);

    
    mockSessionStatus = 5; 
    await request(app.getHttpServer())
      .post('/flows/assign-editor')
      .send({
        sessionId: valid32Hex,
        editorPseudonym: editor20Hex,
      })
      .expect(201);

    
    await request(app.getHttpServer())
      .post('/flows/editorial-screening')
      .send({
        sessionId: valid32Hex,
        editorPseudonym: editor20Hex,
        originalEditorialReportHash: valid32Hex,
        anonymizedEditorialReportHash: valid32Hex,
        anonymizedEditorialReportURI: 'ipfs://report',
        decision: 1, 
      })
      .expect(201);

    
    await request(app.getHttpServer())
      .post('/flows/reviewer-selection')
      .send({
        sessionId: valid32Hex,
        criteriaHash: valid32Hex,
        reviewerCount: 2,
        reviewerAssignmentCommitments: [valid32Hex, valid32Hex],
      })
      .expect(201);

    
    await request(app.getHttpServer())
      .post('/flows/assignment-proofs/editor')
      .send({
        sessionId: valid32Hex,
        editorPseudonym: editor20Hex,
        proofRef: valid32Hex,
      })
      .expect(201);

    
    await request(app.getHttpServer())
      .post('/flows/assignment-proofs/reviewers')
      .send({
        sessionId: valid32Hex,
        assignments: [
          {
            reviewerAssignmentCommitment: valid32Hex,
            proofRef: valid32Hex,
          },
          {
            reviewerAssignmentCommitment: valid32Hex,
            proofRef: valid32Hex,
          },
        ],
      })
      .expect(201);

    
    await request(app.getHttpServer())
      .post('/flows/reviews/phase')
      .send({
        sessionId: valid32Hex,
        phase: 1, 
      })
      .expect(201);

    
    await request(app.getHttpServer())
      .post('/flows/reviews/commit')
      .send({
        sessionId: valid32Hex,
        reviewerPseudonym: rev1_20Hex,
        reviewerAssignmentCommitment: valid32Hex,
        recommendation: 4, 
        reviewHash: valid32Hex,
        reviewURI: 'ipfs://rev',
        nonce: valid32Hex,
      })
      .expect(201);

    
    await request(app.getHttpServer())
      .post('/flows/reviews/phase')
      .send({
        sessionId: valid32Hex,
        phase: 2, 
      })
      .expect(201);

    
    await request(app.getHttpServer())
      .post('/flows/reviews/reveal')
      .send({
        sessionId: valid32Hex,
        reviewerPseudonym: rev1_20Hex,
        reviewerAssignmentCommitment: valid32Hex,
        recommendation: 4,
        reviewHash: valid32Hex,
        reviewURI: 'ipfs://rev',
        nonce: valid32Hex,
      })
      .expect(201);

    
    mockSessionStatus = 10; 
    await request(app.getHttpServer())
      .post('/flows/review-decisions/decide')
      .send({
        sessionId: valid32Hex,
        batch: 1,
        reviewerPseudonyms: [rev1_20Hex],
        additionalReviewerCountIfGrayZone: 0,
      })
      .expect(201);

    
    mockSessionStatus = 10; 
    await request(app.getHttpServer())
      .post('/flows/publication/finalize')
      .send({
        sessionId: valid32Hex,
      })
      .expect(201);

    
    mockSessionStatus = 12; 
    const res = await request(app.getHttpServer())
      .get(`/public/sessions/${valid32Hex}/audit-trail`)
      .expect(200);

    const auditTrailBody = res.body;

    
    expect(auditTrailBody.sessionId).toBe(valid32Hex);
    expect(Array.isArray(auditTrailBody.auditTrail)).toBe(true);

    const phases = auditTrailBody.auditTrail.map((item: any) => item.phase);
    
    
    expect(phases).toEqual(expect.arrayContaining([
      'Submission',
      'Automatic Checks',
      'Editorial Screening',
      'Reviewer Selection',
      'Assignment Proofs',
      'Review Phase State',
      'Latest Review Decision'
    ]));

    
    assertNoPermanentIdentifiers(auditTrailBody);
  });
});
