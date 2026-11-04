import { Test, TestingModule } from '@nestjs/testing';
import { ManuscriptsAutomaticCheckService } from './manuscripts-automatic-check.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

describe('ManuscriptsAutomaticCheckService', () => {
  let service: ManuscriptsAutomaticCheckService;
  const storagePath = path.join(process.cwd(), 'storage', 'manuscripts');
  const dummyId = 'test-check-123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ManuscriptsAutomaticCheckService],
    }).compile();

    service = module.get<ManuscriptsAutomaticCheckService>(ManuscriptsAutomaticCheckService);

    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }
  });

  afterEach(() => {
    const files = [
      `${dummyId}-manifest.json`,
      `${dummyId}.pdf`,
    ];
    for (const f of files) {
      const fp = path.join(storagePath, f);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('checkDirectUpload', () => {
    it('should run deterministic checks on a valid PDF', async () => {
      const { generateSamplePdf } = await import('./utils/sample-generator.util');
      const pdfBuffer = await generateSamplePdf({ title: 'Test Check PDF', authorName: 'John' });

      const file = { originalname: 'test.pdf', buffer: pdfBuffer } as Express.Multer.File;
      const result = await service.checkDirectUpload(file);
      
      expect(result).toBeDefined();
      expect(result.reportId).toBeDefined();
      expect(result.summary.flags.formatValid).toBe(true);
      expect(result.summary.flags.identityExposed).toBe(true);
      expect(['Pass', 'Incomplete']).toContain(result.resultCategory);
      
      const reportPath = path.join(storagePath, `${result.reportId}-check-report.json`);
      expect(fs.existsSync(reportPath)).toBeTruthy();
      if (fs.existsSync(reportPath)) fs.unlinkSync(reportPath);
    });

    it('should throw BadRequestException if file is null', async () => {
      await expect(service.checkDirectUpload(null as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('checkFromIntake', () => {
    it('should throw NotFoundException if manifest missing', async () => {
      await expect(service.checkFromIntake('missing-id')).rejects.toThrow(NotFoundException);
    });
  });
});
