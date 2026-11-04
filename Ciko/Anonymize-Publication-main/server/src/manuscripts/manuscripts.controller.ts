import { Controller, Post, Get, Param, UseInterceptors, UploadedFile, Body, ParseFilePipe, MaxFileSizeValidator, NotFoundException, BadRequestException, Res } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ManuscriptsService } from './manuscripts.service';
import { ManuscriptsAnonymizationService } from './manuscripts-anonymization.service';
import { ManuscriptsAutomaticCheckService } from './manuscripts-automatic-check.service';
import { UploadManuscriptDto } from './dto/upload-manuscript.dto';
import { AutomaticCheckDto } from './dto/automatic-check.dto';
import { PipelineResponseDto } from './dto/pipeline-response.dto';
import type { Response } from 'express';
import { generateSamplePdf } from './utils/sample-generator.util';

@Controller('manuscripts')
export class ManuscriptsController {
  constructor(
    private readonly manuscriptsService: ManuscriptsService,
    private readonly manuscriptsAnonymizationService: ManuscriptsAnonymizationService,
    private readonly manuscriptsAutomaticCheckService: ManuscriptsAutomaticCheckService
  ) {}

  @ApiTags('P01 - Pra-Pengajuan')
  @Post('intake')
  @ApiOperation({ 
    summary: 'Implements P01 - Pra-Pengajuan: menerima unggahan manuskrip mentah.',
    description: 'Upload a raw PDF/DOCX manuscript to be tracked in the local PoC storage. It generates deterministic hashes (fileHash, metadataHash) used for the on-chain F01 submission flow.' 
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UploadManuscriptDto })
  @ApiResponse({ status: 201, description: 'Manuscript uploaded and intake manifest generated successfully', type: PipelineResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid file or metadata' })
  @UseInterceptors(FileInterceptor('file'))
  // Implements P01 Infrastruktur Pra-Pengajuan
  async intake(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 20 * 1024 * 1024 }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() dto: UploadManuscriptDto,
  ) {
    return this.manuscriptsService.intakeManuscript(file, dto);
  }

  @ApiTags('P01 - Pra-Pengajuan')
  @Get(':id/manifest')
  @ApiOperation({ 
    summary: 'Implements P01 - Pra-Pengajuan: mengambil manifes hasil unggahan.',
    description: 'Retrieve the resulting manifest JSON of a previously uploaded manuscript.'
  })
  @ApiParam({ name: 'id', example: '123e4567-e89b-12d3-a456-426614174000', description: 'UUID of the manuscript' })
  @ApiResponse({ status: 200, description: 'Manifest returned successfully' })
  @ApiResponse({ status: 404, description: 'Manifest not found' })
  // Implements P01 manifest retrieval
  async getManifest(@Param('id') id: string) {
    const manifest = await this.manuscriptsService.getManifest(id);
    if (!manifest) {
      throw new NotFoundException(`Manifest for manuscript ${id} not found`);
    }
    return manifest;
  }

  @ApiTags('P04 - Penghapusan Identitas')
  @Post(':id/anonymize')
  @ApiOperation({ 
    summary: 'Implements P04 - Penghapusan Identitas (F07-F08): membersihkan metadata dokumen.',
    description: 'Menutup jalur bias B02, B03 (paparan identitas penulis terhadap editor dan penelaah). Run the rule-based anonymization pipeline to strip metadata and overlay redactions. Generates a new file and returns the anonymizedFileHash for the F08 on-chain flow.'
  })
  @ApiParam({ name: 'id', example: '123e4567-e89b-12d3-a456-426614174000', description: 'UUID of the original manuscript' })
  @ApiResponse({ status: 201, description: 'Manuscript anonymized successfully', type: PipelineResponseDto })
  @ApiResponse({ status: 404, description: 'Manuscript not found' })
  // Implements P04 Penghapusan Identitas (F07-F08)
  // Menutup jalur bias B02, B03 (paparan identitas penulis terhadap editor dan penelaah)
  async processAnonymization(@Param('id') id: string) {
    return this.manuscriptsAnonymizationService.processAnonymization(id);
  }

  @ApiTags('P03 - Pengecekan Otomatis')
  @Post('automatic-check')
  @ApiOperation({ 
    summary: 'Implements P03 - Pengecekan Otomatis (F05-F06): menjalankan pemeriksaan otomatis dokumen.',
    description: 'Execute deterministic checks on the PDF for structure, page counts, and metadata. You can either supply a `manuscriptId` from an earlier intake, or directly upload a file via multipart. Returns a `reportHash` for F06 on-chain flow.'
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: AutomaticCheckDto })
  @ApiResponse({ status: 201, description: 'Automatic check completed successfully', type: PipelineResponseDto })
  @UseInterceptors(FileInterceptor('file'))
  // Implements P03 Pengecekan Otomatis Kelengkapan (F05-F06)
  async recordAutomaticCheck(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: AutomaticCheckDto,
  ) {
    if (dto.manuscriptId) {
      return this.manuscriptsAutomaticCheckService.checkFromIntake(dto.manuscriptId);
    }
    if (file) {
      return this.manuscriptsAutomaticCheckService.checkDirectUpload(file);
    }
    throw new BadRequestException('Must provide either manuscriptId or a file upload');
  }

  @ApiTags('P01 - Pra-Pengajuan')
  @Get('demo/sample')
  @ApiOperation({ 
    summary: 'Helper P01: Download a structured valid dummy PDF',
    description: 'Generates and downloads a dummy PDF perfectly formatted for testing the automatic checks and anonymization.'
  })
  @ApiResponse({ status: 200, description: 'Returns a PDF file stream' })
  async downloadDemoSample(@Res() res: Response) {
    const pdfBuffer = await generateSamplePdf({ 
      title: 'Demo Manuscript for Peer Review',
      authorName: 'Dr. Swagger Tester',
      abstract: 'This is a sample document dynamically generated for testing.'
    });
    
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="demo_manuscript.pdf"',
      'Content-Length': pdfBuffer.length,
    });
    
    res.end(pdfBuffer);
  }
}
