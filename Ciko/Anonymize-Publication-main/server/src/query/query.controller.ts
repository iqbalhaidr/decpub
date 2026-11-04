import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { QueryService } from './query.service';

@ApiTags('Query - Blockchain State')
@Controller()
export class QueryController {
  constructor(private readonly queryService: QueryService) {}

  @ApiOperation({ summary: 'Get connected contracts status and addresses' })
  @Get('contracts/status')
  getContractsStatus() {
    return this.queryService.getContractsStatus();
  }

  @ApiOperation({ summary: 'Get publication session details' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @Get('sessions/:sessionId')
  getSession(@Param('sessionId') sessionId: string) {
    return this.queryService.getSession(sessionId);
  }

  @ApiOperation({ summary: 'Get the latest automatic check record for a session' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @Get('sessions/:sessionId/automatic-checks/latest')
  getAutomaticCheckLatest(@Param('sessionId') sessionId: string) {
    return this.queryService.getAutomaticCheckLatest(sessionId);
  }

  @ApiOperation({ summary: 'Get the latest editorial screening record for a session' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @Get('sessions/:sessionId/editorial-screening/latest')
  getEditorialScreeningLatest(@Param('sessionId') sessionId: string) {
    return this.queryService.getEditorialScreeningLatest(sessionId);
  }

  @ApiOperation({ summary: 'Get the latest reviewer selection batch for a session' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @Get('sessions/:sessionId/reviewer-selection/latest')
  getReviewerSelectionLatest(@Param('sessionId') sessionId: string) {
    return this.queryService.getReviewerSelectionLatest(sessionId);
  }

  @ApiOperation({ summary: 'Get assignment proofs summary for a session' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @Get('sessions/:sessionId/assignment-proofs')
  getAssignmentProofs(@Param('sessionId') sessionId: string) {
    return this.queryService.getAssignmentProofs(sessionId);
  }

  @ApiOperation({ summary: 'Get the current review phase of a session' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @Get('sessions/:sessionId/reviews/phase')
  getReviewPhase(@Param('sessionId') sessionId: string) {
    return this.queryService.getReviewPhase(sessionId);
  }

  @ApiOperation({ summary: 'Get commit and reveal records of a specific reviewer' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @ApiParam({ name: 'reviewerPseudonym', type: 'string', description: 'Hex string of reviewer address' })
  @Get('sessions/:sessionId/reviews/:reviewerPseudonym')
  getReviewSubmissions(
    @Param('sessionId') sessionId: string,
    @Param('reviewerPseudonym') reviewerPseudonym: string,
  ) {
    return this.queryService.getReviewSubmissions(sessionId, reviewerPseudonym);
  }

  @ApiOperation({ summary: 'Get the decision outcome of a specific review batch' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @ApiParam({ name: 'batch', type: 'string', description: 'Numeric string of the batch number' })
  @Get('sessions/:sessionId/decisions/:batch')
  getReviewDecision(
    @Param('sessionId') sessionId: string,
    @Param('batch') batch: string,
  ) {
    return this.queryService.getReviewDecision(sessionId, batch);
  }

  @ApiOperation({ 
    summary: 'Get a combined public snapshot of all records for a session (NF04)',
    description: 'Mendukung NF04 (Auditability) dengan menyediakan jejak audit publik yang transparan dan dapat diverifikasi tanpa mengungkap identitas asli.'
  })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @Get('sessions/:sessionId/public-view')
  // Mendukung NF04 (Auditability) - Ketersediaan jejak audit publik terpadu
  getPublicView(@Param('sessionId') sessionId: string) {
    return this.queryService.getPublicView(sessionId);
  }
}

