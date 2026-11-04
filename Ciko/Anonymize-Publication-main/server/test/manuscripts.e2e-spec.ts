import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('ManuscriptsController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  let manifestId: string;
  let pdfBuffer: Buffer;

  beforeAll(async () => {
    const { generateSamplePdf } = await import('../src/manuscripts/utils/sample-generator.util');
    pdfBuffer = await generateSamplePdf({ title: 'E2E Test PDF' });
  });

  it('/manuscripts/intake (POST)', async () => {
    const response = await request(app.getHttpServer())
      .post('/manuscripts/intake')
      .field('title', 'E2E Test Title')
      .field('authorName', 'E2E Author')
      .field('authorEmail', 'e2e@example.com')
      .attach('file', pdfBuffer, { filename: 'test.pdf', contentType: 'application/pdf' })
      .expect(201);

    expect(response.body).toBeDefined();
    expect(response.body.manuscriptId).toBeDefined();
    expect(response.body.fileHash).toBeDefined();
    manifestId = response.body.manuscriptId;
  });

  it('/manuscripts/:id/manifest (GET)', async () => {
    const response = await request(app.getHttpServer())
      .get(`/manuscripts/${manifestId}/manifest`)
      .expect(200);

    expect(response.body.manuscriptId).toBe(manifestId);
    expect(response.body.metadata.title).toBe('E2E Test Title');
  });

  it('/manuscripts/:id/manifest (GET) - not found', async () => {
    await request(app.getHttpServer())
      .get(`/manuscripts/invalid-id-123/manifest`)
      .expect(404);
  });

  it('/manuscripts/:id/anonymize (POST)', async () => {
    const response = await request(app.getHttpServer())
      .post(`/manuscripts/${manifestId}/anonymize`)
      .expect(201);

    expect(response.body).toBeDefined();
    expect(response.body.anonymizedFileHash).toBeDefined();
    expect(response.body.originalManuscriptId).toBe(manifestId);
  });

  it('/manuscripts/automatic-check (POST) - with file', async () => {
    const response = await request(app.getHttpServer())
      .post('/manuscripts/automatic-check')
      .attach('file', pdfBuffer, { filename: 'test-check.pdf', contentType: 'application/pdf' })
      .expect(201);

    expect(response.body).toBeDefined();
    expect(response.body.reportHash).toBeDefined();
    expect(response.body.resultCategory).toBeDefined();
  });

  it('/manuscripts/automatic-check (POST) - with manuscriptId', async () => {
    const response = await request(app.getHttpServer())
      .post('/manuscripts/automatic-check')
      .send({ manuscriptId: manifestId })
      .expect(201);

    expect(response.body).toBeDefined();
    expect(response.body.reportHash).toBeDefined();
  });
});
