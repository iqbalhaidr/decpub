import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { FlowsService } from './flows.service';
import {
  CreateEphemeralAccountDto,
  SubmitPublicationDto,
  RecordAutomaticCheckDto,
  ProcessAnonymizationDto,
  AssignEditorDto,
  RecordEditorialScreeningDto,
  RecordReviewerSelectionDto,
  RecordEditorAssignmentProofDto,
  BatchRecordReviewerAssignmentProofsDto,
  SetReviewPhaseDto,
  CommitReviewDto,
  RevealReviewDto,
  DecideBatchDto,
  FinalizePublicationDto,
} from './flows.dto';

@Controller('flows')
export class FlowsController {
  constructor(private readonly flowsService: FlowsService) {}

  @ApiTags('Setup - Ephemeral Accounts')
  @ApiOperation({ summary: 'Create an ephemeral account for Author, Editor, or Reviewer' })
  @Post('ephemeral-account')
  createEphemeralAccount(@Body() dto: CreateEphemeralAccountDto) {
    return this.flowsService.createEphemeralAccount(dto);
  }

  @ApiTags('P02 - Pengajuan Manuskrip')
  @ApiOperation({ 
    summary: 'Implements P02 - Pengajuan Manuskrip (F01-F04): mencatat metadata di DLT.',
    description: 'Menutup jalur bias B01 (bias afiliasi awal pengarang). On-chain submission flow. Receives `fileHash` and `metadataHash` generated from the Manuscript Intake pipeline (backward compatible).'
  })
  @Post('submission')
  // Implements P02 Pengajuan Manuskrip (F01-F04)
  // Menutup jalur bias B01 (bias afiliasi awal pengarang)
  submitPublication(@Body() dto: SubmitPublicationDto) {
    return this.flowsService.submitPublication(dto);
  }

  @ApiTags('P03 - Pengecekan Otomatis')
  @ApiOperation({ 
    summary: 'Implements P03 - Pengecekan Otomatis (F05-F06): mencatat laporan di DLT.',
    description: 'On-chain flow. Receives `reportHash` and `flagsHash` from the Automatic Checks pipeline to trigger `recordAutomaticCheck` on the blockchain.'
  })
  @Post('automatic-checks')
  // Implements P03 Pengecekan Otomatis Kelengkapan (F05-F06)
  recordAutomaticCheck(@Body() dto: RecordAutomaticCheckDto) {
    return this.flowsService.recordAutomaticCheck(dto);
  }

  @ApiTags('P02 - Pengajuan Manuskrip')
  @ApiOperation({ summary: 'Get summary state of submission and automatic checks (F02 & F04)' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @Get('submission/:sessionId')
  getSubmissionFlowState(@Param('sessionId') sessionId: string) {
    return this.flowsService.getSubmissionFlowState(sessionId);
  }

  @ApiTags('P04 - Penghapusan Identitas')
  @ApiOperation({ 
    summary: 'Implements P04 - Penghapusan Identitas (F07-F08): mencatat bukti anonimisasi di DLT.',
    description: 'Menutup jalur bias B02, B03 (paparan identitas pengarang terhadap eksternal). On-chain flow. Receives `anonymizedFileHash` from the Anonymization pipeline and records the artifact separation proof on the blockchain.'
  })
  @Post('anonymization')
  // Implements P04 Penghapusan Identitas (F07-F08)
  // Menutup jalur bias B02, B03 (paparan identitas pengarang terhadap eksternal)
  processAnonymization(@Body() dto: ProcessAnonymizationDto) {
    return this.flowsService.processAnonymization(dto);
  }

  @ApiTags('P04 - Penghapusan Identitas')
  @ApiOperation({ summary: 'Get anonymized artifact separation proof for a session (P04)' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @Get('anonymization/:sessionId')
  getAnonymizedArtifactProof(@Param('sessionId') sessionId: string) {
    return this.flowsService.getAnonymizedArtifactProof(sessionId);
  }

  @ApiTags('P05 - Penyaringan Editorial')
  @ApiOperation({ summary: 'Implements P05 - Penyaringan Editorial (F09): menugaskan editor.' })
  @Post('assign-editor')
  // Implements P05 Penyaringan Editorial (F09)
  assignEditor(@Body() dto: AssignEditorDto) {
    return this.flowsService.assignEditor(dto);
  }

  @ApiTags('P05 - Penyaringan Editorial')
  @ApiOperation({ 
    summary: 'Implements P05 - Penyaringan Editorial (F10-F11): mencatat keputusan awal editor.',
    description: 'Menutup jalur bias B04 (bias penyaringan editorial tanpa jejak).'
  })
  @Post('editorial-screening')
  // Implements P05 Penyaringan Editorial (F10-F11)
  // Menutup jalur bias B04 (bias penyaringan editorial tanpa jejak)
  recordEditorialScreening(@Body() dto: RecordEditorialScreeningDto) {
    return this.flowsService.recordEditorialScreening(dto);
  }

  @ApiTags('P05 - Penyaringan Editorial')
  @ApiOperation({ summary: 'Get the latest editorial screening record' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @Get('editorial-screening/:sessionId/latest')
  getEditorialScreeningLatest(@Param('sessionId') sessionId: string) {
    return this.flowsService.getEditorialScreeningLatest(sessionId);
  }

  @ApiTags('P05 - Penyaringan Editorial')
  @ApiOperation({ summary: 'Get full history of editorial screenings' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @Get('editorial-screening/:sessionId/history')
  getEditorialScreeningHistory(@Param('sessionId') sessionId: string) {
    return this.flowsService.getEditorialScreeningHistory(sessionId);
  }

  @ApiTags('P06 - Pemilihan Penelaah')
  @ApiOperation({ 
    summary: 'Implements P06 - Pemilihan Penelaah (F12-F13): menunjuk penelaah.',
    description: 'Menutup jalur bias B05 (bias penunjukan penelaah sepihak).'
  })
  @Post('reviewer-selection')
  // Implements P06 Pemilihan Penelaah (F12-F13)
  // Menutup jalur bias B05 (bias penunjukan penelaah sepihak)
  recordReviewerSelectionBatch(@Body() dto: RecordReviewerSelectionDto) {
    return this.flowsService.recordReviewerSelectionBatch(dto);
  }

  @ApiTags('P06 - Pemilihan Penelaah')
  @ApiOperation({ summary: 'Get the latest reviewer selection batch' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @Get('reviewer-selection/:sessionId/latest')
  getReviewerSelectionLatest(@Param('sessionId') sessionId: string) {
    return this.flowsService.getReviewerSelectionLatest(sessionId);
  }

  @ApiTags('P06 - Pemilihan Penelaah')
  @ApiOperation({ summary: 'Implements P06 - Pemilihan Penelaah (F14): menyimpan bukti penugasan editor.' })
  @Post('assignment-proofs/editor')
  // Implements P06 Pemilihan Penelaah (F14)
  recordEditorAssignmentProof(@Body() dto: RecordEditorAssignmentProofDto) {
    return this.flowsService.recordEditorAssignmentProof(dto);
  }

  @ApiTags('P06 - Pemilihan Penelaah')
  @ApiOperation({ summary: 'Implements P06 - Pemilihan Penelaah (F14): menyimpan bukti penugasan penelaah.' })
  @Post('assignment-proofs/reviewers')
  // Implements P06 Pemilihan Penelaah (F14)
  batchRecordReviewerAssignmentProofs(@Body() dto: BatchRecordReviewerAssignmentProofsDto) {
    return this.flowsService.batchRecordReviewerAssignmentProofs(dto);
  }

  @ApiTags('P06 - Pemilihan Penelaah')
  @ApiOperation({ summary: 'Get assignment proofs for a session' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @Get('assignment-proofs/:sessionId')
  getAssignmentProofs(@Param('sessionId') sessionId: string) {
    return this.flowsService.getAssignmentProofs(sessionId);
  }

  @ApiTags('Helper')
  @ApiOperation({ summary: 'Helper: Generate deterministic commitment locally' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @ApiParam({ name: 'pseudonym', type: 'string', description: 'Pseudonym address' })
  @ApiParam({ name: 'salt', type: 'string', description: 'Hex string salt' })
  @Get('helper/commitment/:sessionId/:pseudonym/:salt')
  generateDeterministicCommitment(
    @Param('sessionId') sessionId: string,
    @Param('pseudonym') pseudonym: string,
    @Param('salt') salt: string,
  ) {
    return this.flowsService.generateDeterministicCommitment(sessionId, pseudonym, salt);
  }

  @ApiTags('P07 - Telaah & Keputusan Akhir')
  @ApiOperation({ summary: 'Set the current review phase (Commit, Reveal, Closed)' })
  @Post('reviews/phase')
  setReviewPhase(@Body() dto: SetReviewPhaseDto) {
    return this.flowsService.setReviewPhase(dto);
  }

  @ApiTags('P07 - Telaah & Keputusan Akhir')
  @ApiOperation({ 
    summary: 'Implements P07 - Telaah & Keputusan Akhir (F15): komitmen nilai telaah awal.',
    description: 'Menutup jalur bias B06 (anchor bias selama proses telaah).'
  })
  @Post('reviews/commit')
  // Implements P07 Telaah & Keputusan Akhir (F15)
  // Menutup jalur bias B06 (anchor bias selama proses telaah)
  commitReview(@Body() dto: CommitReviewDto) {
    return this.flowsService.commitReview(dto);
  }

  @ApiTags('P07 - Telaah & Keputusan Akhir')
  @ApiOperation({ summary: 'Implements P07 - Telaah & Keputusan Akhir (F16): membuka nilai telaah.' })
  @Post('reviews/reveal')
  // Implements P07 Telaah & Keputusan Akhir (F16)
  revealReview(@Body() dto: RevealReviewDto) {
    return this.flowsService.revealReview(dto);
  }

  @ApiTags('P07 - Telaah & Keputusan Akhir')
  @ApiOperation({ summary: 'Get current review phase of a session' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @Get('reviews/:sessionId/phase')
  getReviewPhase(@Param('sessionId') sessionId: string) {
    return this.flowsService.getReviewPhase(sessionId);
  }

  @ApiTags('P07 - Telaah & Keputusan Akhir')
  @ApiOperation({ summary: 'Get reviewer submission status' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @ApiParam({ name: 'reviewerPseudonym', type: 'string', description: 'Reviewer pseudonym address' })
  @Get('reviews/:sessionId/reviewer/:reviewerPseudonym')
  getReviewerSubmission(
    @Param('sessionId') sessionId: string,
    @Param('reviewerPseudonym') reviewerPseudonym: string,
  ) {
    return this.flowsService.getReviewerSubmission(sessionId, reviewerPseudonym);
  }

  @ApiTags('P07 - Telaah & Keputusan Akhir')
  @ApiOperation({ summary: 'Implements P07 - Telaah & Keputusan Akhir (F17-F18): agregasi dan keputusan telaah.' })
  @Post('review-decisions/decide')
  // Implements P07 Telaah & Keputusan Akhir (F17-F18)
  decideBatch(@Body() dto: DecideBatchDto) {
    return this.flowsService.decideBatch(dto);
  }

  @ApiTags('P07 - Telaah & Keputusan Akhir')
  @ApiOperation({ summary: 'Get a specific review decision batch record' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @ApiParam({ name: 'batch', type: 'number', description: 'Batch number' })
  @Get('review-decisions/:sessionId/:batch')
  getReviewDecision(
    @Param('sessionId') sessionId: string,
    @Param('batch') batch: number,
  ) {
    return this.flowsService.getReviewDecision(sessionId, Number(batch));
  }

  @ApiTags('P07 - Telaah & Keputusan Akhir')
  @ApiOperation({ summary: 'Get a summary projection of a review decision batch (P07 / F18)' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @ApiParam({ name: 'batch', type: 'number', description: 'Batch number' })
  @Get('review-decisions/:sessionId/:batch/summary')
  getReviewDecisionSummary(
    @Param('sessionId') sessionId: string,
    @Param('batch') batch: number,
  ) {
    return this.flowsService.getReviewDecisionSummary(sessionId, Number(batch));
  }

  @ApiTags('P08 - Pascapublikasi')
  @ApiOperation({ summary: 'Implements P08 - Pascapublikasi (F19-F20): memfinalisasi naskah akhir di DLT.' })
  @Post('publication/finalize')
  // Implements P08 Pascapublikasi (F19-F20)
  finalizePublication(@Body() dto: FinalizePublicationDto) {
    return this.flowsService.finalizePublication(dto);
  }
}

