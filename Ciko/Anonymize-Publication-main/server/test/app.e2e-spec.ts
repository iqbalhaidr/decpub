import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { ContractsService } from '../src/contracts/contracts.service';
import { BlockchainService } from '../src/blockchain/blockchain.service';

describe('App E2E', () => {
  let app: INestApplication;
  
  const mockContractsService = {
    read: jest.fn(),
    write: jest.fn(),
    getAddress: jest.fn().mockReturnValue('0x123'),
  };

  const mockBlockchainService = {
    publicClient: {
      getBlockNumber: jest.fn(),
      getChainId: jest.fn(),
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ContractsService).useValue(mockContractsService)
      .overrideProvider(BlockchainService).useValue(mockBlockchainService)
      .compile();

    app = moduleFixture.createNestApplication();
    
    
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    
    await app.init();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('HealthController (e2e)', () => {
    it('GET /health (happy path)', async () => {
      mockBlockchainService.publicClient.getBlockNumber.mockResolvedValue(100n);
      mockBlockchainService.publicClient.getChainId.mockResolvedValue(1337);

      const res = await request(app.getHttpServer()).get('/health').expect(200);

      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body.rpc).toHaveProperty('chainId', 1337);
      expect(res.body.contracts).toBeDefined();
    });
  });

  describe('FlowsController (e2e)', () => {
    const valid32Hex = '0x' + 'a'.repeat(64);
    const valid20Hex = '0x' + 'b'.repeat(40);

    it('POST /flows/submission (happy path)', async () => {
      mockContractsService.read.mockResolvedValue({ exists: true, statusValue: 1, status: 1 });
      mockContractsService.write.mockResolvedValue({ txHash: '0xabc', blockNumber: 1 });

      const res = await request(app.getHttpServer())
        .post('/flows/submission')
        .send({
          sessionId: valid32Hex,
          authorPseudonym: valid20Hex,
          originalManuscriptHash: valid32Hex,
          anonymizedManuscriptHash: valid32Hex,
          metadataHash: valid32Hex,
          anonymousManuscriptURI: 'ipfs://m',
          anonymousMetadataURI: 'ipfs://n',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('message');
      expect(res.body.txHash).toBe('0xabc');
    });

    it('POST /flows/submission (validation error)', async () => {
      const res = await request(app.getHttpServer())
        .post('/flows/submission')
        .send({
          sessionId: 'invalid-hex',
        })
        .expect(400);

      expect(res.body.message).toBeInstanceOf(Array);
    });

    it('POST /flows/automatic-checks (happy path)', async () => {
      mockContractsService.read.mockResolvedValue({ exists: true, statusValue: 3, status: 3 });
      mockContractsService.write.mockResolvedValue({ txHash: '0x123', blockNumber: 2 });

      const res = await request(app.getHttpServer())
        .post('/flows/automatic-checks')
        .send({
          sessionId: valid32Hex,
          reportHash: valid32Hex,
          flagsHash: valid32Hex,
          reportURI: 'ipfs://rep',
          result: 1,
        })
        .expect(201);

      expect(res.body.txHash).toBe('0x123');
    });

    it('POST /flows/anonymization (happy path)', async () => {
      mockContractsService.read.mockResolvedValue({ exists: true, statusValue: 4, status: 4 });
      mockContractsService.write.mockResolvedValue({ txHash: '0x123', blockNumber: 2 });

      const res = await request(app.getHttpServer())
        .post('/flows/anonymization')
        .send({
          sessionId: valid32Hex,
          anonymizedManuscriptHash: valid32Hex,
          metadataHash: valid32Hex,
          anonymousManuscriptURI: 'ipfs',
          anonymousMetadataURI: 'ipfs',
        });
      
      expect(res.status).toBe(201);
    });

    it('POST /flows/reviews/commit (happy path)', async () => {
      mockContractsService.write.mockResolvedValue({ txHash: '0x123', blockNumber: 2 });
      mockContractsService.read.mockResolvedValue({ exists: true, recommendation: 1, submittedAt: 1 });

      const res = await request(app.getHttpServer())
        .post('/flows/reviews/commit')
        .send({
          sessionId: valid32Hex,
          reviewerPseudonym: valid20Hex,
          reviewerAssignmentCommitment: valid32Hex,
          recommendation: 2,
          reviewHash: valid32Hex,
          reviewURI: 'ipfs',
          nonce: valid32Hex,
        });
      
      expect(res.status).toBe(201);
    });

    it('POST /flows/review-decisions/decide (happy path)', async () => {
      mockContractsService.read.mockResolvedValue({ exists: true, statusValue: 10, status: 10, batch: 1 });
      mockContractsService.write.mockResolvedValue({ txHash: '0x123', blockNumber: 2 });

      const res = await request(app.getHttpServer())
        .post('/flows/review-decisions/decide')
        .send({
          sessionId: valid32Hex,
          batch: 1,
          reviewerPseudonyms: [valid20Hex],
          additionalReviewerCountIfGrayZone: 0,
        });
      
      expect(res.status).toBe(201);
    });
  });

  describe('QueryController (e2e)', () => {
    const valid32Hex = '0x' + 'a'.repeat(64);

    it('GET /sessions/:sessionId (happy path)', async () => {
      mockContractsService.read.mockResolvedValue({
        exists: true,
        sessionId: valid32Hex,
        status: 1,
        createdAt: 1000,
        updatedAt: 1000,
        revisionCount: 0,
      });

      const res = await request(app.getHttpServer())
        .get(`/sessions/${valid32Hex}`);
      
      expect(res.status).toBe(200);
      expect(res.body.exists).toBe(true);
      expect(res.body.status).toBe('Submitted');
    });

    it('GET /sessions/:sessionId (not found)', async () => {
      mockContractsService.read.mockResolvedValue({ exists: false });

      const res = await request(app.getHttpServer())
        .get(`/sessions/${valid32Hex}`);
      expect(res.status).toBe(404);
    });

    it('GET /sessions/:sessionId (invalid format)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/sessions/invalid-hash`);
      expect(res.status).toBe(400);
    });
  });

  describe('PublicController (e2e)', () => {
    const valid32Hex = '0x' + 'a'.repeat(64);

    it('GET /public/sessions/:sessionId (happy path)', async () => {
      mockContractsService.read.mockResolvedValue({
        exists: true, sessionId: valid32Hex, status: 12, createdAt: 1, updatedAt: 1, revisionCount: 0,
        decision: 1, batch: 1, reviewerProofCount: 1, reportHash: valid32Hex, flagsHash: valid32Hex
      });

      const res = await request(app.getHttpServer())
        .get(`/public/sessions/${valid32Hex}`);
      
      expect(res.status).toBe(200);
      expect(res.body.session).toBeDefined();
    });

    it('GET /public/sessions/:sessionId/audit-trail (happy path)', async () => {
      mockContractsService.read.mockResolvedValue({
        exists: true, sessionId: valid32Hex, status: 12, createdAt: 1, updatedAt: 1, revisionCount: 0,
        decision: 1, batch: 1, reviewerProofCount: 1, reportHash: valid32Hex, flagsHash: valid32Hex
      });

      const res = await request(app.getHttpServer())
        .get(`/public/sessions/${valid32Hex}/audit-trail`);
      
      expect(res.status).toBe(200);

      expect(res.body.sessionId).toBe(valid32Hex);
      expect(res.body.auditTrail).toBeInstanceOf(Array);
    });
  });
});
