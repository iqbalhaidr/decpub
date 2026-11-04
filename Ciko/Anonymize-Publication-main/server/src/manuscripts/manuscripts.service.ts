import { Injectable, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { UploadManuscriptDto } from './dto/upload-manuscript.dto';
import { PipelineResponseDto } from './dto/pipeline-response.dto';
import { STORAGE_PATH, ensureStorageExists, getManifestPath, generateFileHash, generateMetadataHash, loadManifest } from './utils/manuscript.util';

@Injectable()
export class ManuscriptsService {
  constructor() {
    ensureStorageExists();
  }

  // Implements P01 Infrastruktur Pra-Pengajuan
  async intakeManuscript(file: Express.Multer.File, dto: UploadManuscriptDto): Promise<PipelineResponseDto> {
    if (!file) {
      throw new BadRequestException('Manuscript file is required');
    }

    const allowedMimeTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException('Only PDF and DOCX files are allowed');
    }

    const manuscriptId = crypto.randomUUID();
    const fileExtension = path.extname(file.originalname) || (file.mimetype === 'application/pdf' ? '.pdf' : '.docx');
    const filename = `${manuscriptId}${fileExtension}`;
    const filePath = path.join(STORAGE_PATH, filename);

    fs.writeFileSync(filePath, file.buffer);

    const fileHash = generateFileHash(file.buffer);

    const metadata = {
      title: dto.title,
      authorName: dto.authorName,
      authorEmail: dto.authorEmail,
      affiliation: dto.affiliation || '',
      originalFileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedAt: new Date().toISOString(),
    };

    const metadataHash = generateMetadataHash(metadata);

    const manifest = {
      manuscriptId,
      fileHash,
      metadataHash,
      metadata,
    };

    const manifestPath = getManifestPath(manuscriptId);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    return {
      message: 'Manuscript intake successful',
      inputReference: file.originalname,
      hashes: {
        fileHash,
        metadataHash,
      },
      paths: {
        manifest: manifestPath,
        file: filePath,
      },
      result: manifest,
      
      // Backward compatibility
      fileHash,
      metadataHash,
      ...manifest
    };
  }

  async getManifest(manuscriptId: string) {
    try {
      return loadManifest(manuscriptId);
    } catch {
      return null;
    }
  }
}

