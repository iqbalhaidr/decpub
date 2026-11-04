import { Test, TestingModule } from '@nestjs/testing';
import { ManuscriptsService } from './manuscripts.service';
import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

describe('ManuscriptsService', () => {
  let service: ManuscriptsService;
  const storagePath = path.join(process.cwd(), 'storage', 'manuscripts');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ManuscriptsService],
    }).compile();

    service = module.get<ManuscriptsService>(ManuscriptsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('intakeManuscript', () => {
    it('should throw BadRequestException if file is missing', async () => {
      await expect(service.intakeManuscript(null, {} as any)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if file type is invalid', async () => {
      const file = {
        mimetype: 'text/plain',
      } as Express.Multer.File;
      await expect(service.intakeManuscript(file, {} as any)).rejects.toThrow(BadRequestException);
    });

    it('should successfully save manuscript and generate manifest', async () => {
      const { generateSamplePdf } = await import('./utils/sample-generator.util');
      const pdfBuffer = await generateSamplePdf({
        title: 'Test Title',
        authorName: 'Author Name',
        authorEmail: 'author@test.com',
      });

      const file = {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        size: pdfBuffer.length,
        buffer: pdfBuffer,
      } as Express.Multer.File;
      
      const dto = {
        title: 'Test Title',
        authorName: 'Author Name',
        authorEmail: 'author@test.com',
      };

      const manifest = await service.intakeManuscript(file, dto);
      
      expect(manifest).toBeDefined();
      expect(manifest.manuscriptId).toBeDefined();
      expect(manifest.fileHash).toBeDefined();
      expect(manifest.metadataHash).toBeDefined();
      expect(manifest.metadata.title).toBe(dto.title);

      // Verify files were created
      const filePath = path.join(storagePath, `${manifest.manuscriptId}.pdf`);
      const manifestPath = path.join(storagePath, `${manifest.manuscriptId}-manifest.json`);
      
      expect(fs.existsSync(filePath)).toBeTruthy();
      expect(fs.existsSync(manifestPath)).toBeTruthy();

      // Cleanup
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
    });
  });
});
