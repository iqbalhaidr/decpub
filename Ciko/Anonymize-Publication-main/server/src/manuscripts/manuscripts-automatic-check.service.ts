import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PDFDocument } from 'pdf-lib';
import { PipelineResponseDto } from './dto/pipeline-response.dto';
import { STORAGE_PATH, ensureStorageExists, loadManifest, loadFileBuffer, generateMetadataHash } from './utils/manuscript.util';

export interface AutomaticCheckResult {
  reportId: string;
  reportHash: string;
  flagsHash: string;
  resultCategory: 'Pass' | 'Incomplete' | 'Reject';
  summary: any;
  reportUri: string;
}

@Injectable()
export class ManuscriptsAutomaticCheckService {
  constructor() {
    ensureStorageExists();
  }

  async runCheck(fileBuffer: Buffer, originalFilename: string): Promise<PipelineResponseDto<AutomaticCheckResult>> {
    const reportId = crypto.randomUUID();
    let isReadable = false;
    let pageCount = 0;
    let hasTitle = false;
    let hasAuthor = false;
    let hasKeywords = false;
    let hasAbstract = false;

    try {
      const pdfDoc = await PDFDocument.load(fileBuffer);
      isReadable = true;
      pageCount = pdfDoc.getPageCount();
      hasTitle = !!pdfDoc.getTitle();
      hasAuthor = !!pdfDoc.getAuthor();
      const keywords = pdfDoc.getKeywords();
      hasKeywords = !!(keywords && keywords.trim().length > 0);
      hasAbstract = !!pdfDoc.getSubject();
    } catch (e) {
      isReadable = false;
    }

    const isPdf = originalFilename.toLowerCase().endsWith('.pdf');
    const validSize = fileBuffer.length > 0 && fileBuffer.length < 50 * 1024 * 1024; // < 50MB

    const flags = {
      formatValid: isPdf && isReadable,
      sizeValid: validSize,
      pageCountValid: pageCount > 0 && pageCount < 100,
      metadataPresent: hasTitle && hasKeywords,
      identityExposed: hasAuthor,
      abstractPresent: hasAbstract,
    };

    let resultCategory: 'Pass' | 'Incomplete' | 'Reject' = 'Pass';

    if (!flags.formatValid || !flags.sizeValid || !flags.pageCountValid) {
      resultCategory = 'Reject';
    } else if (!flags.metadataPresent || !flags.abstractPresent) {
      resultCategory = 'Incomplete';
    } else {
      resultCategory = 'Pass';
    }

    const summary = {
      checkedAt: new Date().toISOString(),
      fileSize: fileBuffer.length,
      pageCount,
      flags,
      resultCategory,
      notes: 'Deterministic PoC rule-based checking applied. Semantic checking is bypassed.',
    };

    // Calculate hash manually or use util. But generateMetadataHash expects an object which it stringifies
    const reportHash = generateMetadataHash(summary);
    const flagsHash = generateMetadataHash(flags);
    
    const reportPath = path.join(STORAGE_PATH, `${reportId}-check-report.json`);
    const reportUri = `file://storage/manuscripts/${reportId}-check-report.json`;
    
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));

    const resultObj: AutomaticCheckResult = {
      reportId,
      reportHash,
      flagsHash,
      resultCategory,
      summary,
      reportUri
    };

    return {
      message: 'Automatic check completed successfully',
      inputReference: originalFilename,
      hashes: {
        reportHash,
        flagsHash,
      },
      paths: {
        report: reportPath,
      },
      result: resultObj,

      // Backward compatibility
      reportHash,
      flagsHash,
      resultCategory,
      ...resultObj
    };
  }

  // Implements P03 Pengecekan Otomatis Kelengkapan (F05-F06) dari dokumen intake
  async checkFromIntake(manuscriptId: string): Promise<PipelineResponseDto<AutomaticCheckResult>> {
    const manifest = loadManifest(manuscriptId);
    const fileExtension = manifest.metadata.mimeType === 'application/pdf' ? '.pdf' : '.docx';
    const fileBuffer = loadFileBuffer(manuscriptId, fileExtension);
    
    return this.runCheck(fileBuffer, `${manuscriptId}${fileExtension}`);
  }

  async checkDirectUpload(file: Express.Multer.File): Promise<PipelineResponseDto<AutomaticCheckResult>> {
    if (!file) {
      throw new BadRequestException('File is required for direct checking');
    }
    return this.runCheck(file.buffer, file.originalname);
  }
}
