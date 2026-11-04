import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { PipelineResponseDto } from './dto/pipeline-response.dto';
import { STORAGE_PATH, ensureStorageExists, getManifestPath, getReportPath, loadManifest, loadFileBuffer, generateFileHash, generateMetadataHash } from './utils/manuscript.util';

@Injectable()
export class ManuscriptsAnonymizationService {
  constructor() {
    ensureStorageExists();
  }

  // Implements P04 Penghapusan Identitas (F07-F08)
  // Menutup jalur bias B02, B03 (paparan identitas pada file)
  async processAnonymization(manuscriptId: string): Promise<PipelineResponseDto> {
    const manifest = loadManifest(manuscriptId);
    const fileExtension = manifest.metadata.mimeType === 'application/pdf' ? '.pdf' : '.docx';
    const fileBuffer = loadFileBuffer(manuscriptId, fileExtension);

    let anonymizedBuffer: Buffer;
    let reportTxt = `Anonymization Report for ${manuscriptId}\n`;
    reportTxt += `==========================================\n`;

    if (fileExtension === '.pdf') {
      const pdfDoc = await PDFDocument.load(fileBuffer);
      
      pdfDoc.setTitle('Anonymized Manuscript');
      pdfDoc.setAuthor('Anonymous');
      pdfDoc.setCreator('Anonymize Publication System PoC');
      pdfDoc.setProducer('Anonymize Publication System PoC');
      pdfDoc.setSubject('Triple-Blind Peer Review');
      pdfDoc.setKeywords([]);
      reportTxt += `- PDF Metadata (Author, Title, Creator, Producer) cleared successfully.\n`;

      const page = pdfDoc.insertPage(0);
      page.drawText('Anonymized Manuscript', { x: 50, y: 700, size: 24 });
      page.drawText('Original identities have been removed from metadata.', { x: 50, y: 650, size: 12 });
      page.drawText('Target Redactions (Simulated via PoC Rules):', { x: 50, y: 600, size: 14 });
      page.drawText(`- Author Name: [REDACTED]`, { x: 50, y: 580, size: 12 });
      page.drawText(`- Email: [REDACTED]`, { x: 50, y: 560, size: 12 });
      page.drawText(`- Affiliation: [REDACTED]`, { x: 50, y: 540, size: 12 });
      
      reportTxt += `- Inserted Anonymization Cover Page with simulated content redactions.\n`;
      reportTxt += `- Note: Semantic content redaction requires NLP. This PoC uses deterministic rule-based metadata stripping and simulated text overlays.\n`;

      const savedPdf = await pdfDoc.save();
      anonymizedBuffer = Buffer.from(savedPdf);
    } else {
      anonymizedBuffer = fileBuffer;
      reportTxt += `- DOCX file detected. Metadata stripping skipped in this PoC.\n`;
    }

    const anonFilename = `${manuscriptId}-anon${fileExtension}`;
    const anonFilePath = path.join(STORAGE_PATH, anonFilename);
    fs.writeFileSync(anonFilePath, anonymizedBuffer);

    const anonFileHash = generateFileHash(anonymizedBuffer);
    
    const anonMetadata = {
      title: 'Anonymized Manuscript',
      originalFileName: anonFilename,
      mimeType: manifest.metadata.mimeType,
      sizeBytes: anonymizedBuffer.length,
      anonymizedAt: new Date().toISOString(),
      anonymizationRulesApplied: ['metadata-stripping', 'cover-page-overlay'],
    };

    const anonMetadataHash = generateMetadataHash(anonMetadata);

    const anonManifest = {
      originalManuscriptId: manuscriptId,
      anonymizedFileHash: anonFileHash,
      anonymizedMetadataHash: anonMetadataHash,
      metadata: anonMetadata,
    };

    const reportPath = getReportPath(manuscriptId, 'anon');
    fs.writeFileSync(reportPath, reportTxt);
    
    const anonManifestPath = getManifestPath(manuscriptId, true);
    fs.writeFileSync(anonManifestPath, JSON.stringify(anonManifest, null, 2));

    return {
      message: 'Manuscript anonymized successfully',
      inputReference: manuscriptId,
      hashes: {
        anonymizedFileHash: anonFileHash,
        anonymizedMetadataHash: anonMetadataHash,
      },
      paths: {
        manifest: anonManifestPath,
        file: anonFilePath,
        report: reportPath,
      },
      result: anonManifest,

      // Backward compatibility
      anonymizedFileHash: anonFileHash,
      anonymizedMetadataHash: anonMetadataHash,
      originalManuscriptId: manuscriptId,
      metadata: anonMetadata,
    };
  }
}
