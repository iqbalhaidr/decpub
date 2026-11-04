import { Test, TestingModule } from '@nestjs/testing';
import { ManuscriptsAnonymizationService } from './manuscripts-anonymization.service';
import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

describe('ManuscriptsAnonymizationService', () => {
  let service: ManuscriptsAnonymizationService;
  const storagePath = path.join(process.cwd(), 'storage', 'manuscripts');
  const dummyId = 'test-anon-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ManuscriptsAnonymizationService],
    }).compile();

    service = module.get<ManuscriptsAnonymizationService>(ManuscriptsAnonymizationService);

    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }
  });

  afterEach(() => {
    const files = [
      `${dummyId}-manifest.json`,
      `${dummyId}.pdf`,
      `${dummyId}-anon.pdf`,
      `${dummyId}-anon-manifest.json`,
      `${dummyId}-anon-report.txt`,
    ];
    for (const f of files) {
      const fp = path.join(storagePath, f);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processAnonymization', () => {
    it('should throw NotFoundException if manifest does not exist', async () => {
      await expect(service.processAnonymization('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should anonymize pdf and generate report and new manifest', async () => {
      const manifestPath = path.join(storagePath, `${dummyId}-manifest.json`);
      const filePath = path.join(storagePath, `${dummyId}.pdf`);

      const { generateSamplePdf } = await import('./utils/sample-generator.util');
      const pdfBuffer = await generateSamplePdf({ title: 'Test PDF' });

      fs.writeFileSync(manifestPath, JSON.stringify({
        metadata: { mimeType: 'application/pdf' }
      }));
      fs.writeFileSync(filePath, pdfBuffer);

      const result = await service.processAnonymization(dummyId);
      
      expect(result).toBeDefined();
      expect(result.originalManuscriptId).toBe(dummyId);
      expect(result.anonymizedFileHash).toBeDefined();
      expect(result.metadata.anonymizationRulesApplied).toContain('metadata-stripping');

      expect(fs.existsSync(path.join(storagePath, `${dummyId}-anon.pdf`))).toBeTruthy();
      expect(fs.existsSync(path.join(storagePath, `${dummyId}-anon-report.txt`))).toBeTruthy();
      expect(fs.existsSync(path.join(storagePath, `${dummyId}-anon-manifest.json`))).toBeTruthy();
    });
  });
});
