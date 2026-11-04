import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { QueryService } from '../query/query.service';

@ApiTags('Public / Post-Publication')
@Controller('public')
export class PublicController {
  constructor(private readonly queryService: QueryService) {}

  @ApiOperation({ summary: 'Get post-publication public projection (F19 & F20)' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @Get('sessions/:sessionId')
  // Mendukung NF04 (Auditability) - menyediakan proyeksi data publik yang dapat diaudit tanpa membuka identitas.
  getPublicSession(@Param('sessionId') sessionId: string) {
    
    return this.queryService.getPublicView(sessionId);
  }

  @ApiOperation({ summary: 'Get the full sequential audit trail of the session (F20)' })
  @ApiParam({ name: 'sessionId', type: 'string', description: 'Hex string of sessionId' })
  @Get('sessions/:sessionId/audit-trail')
  // Mendukung NF04 (Auditability) - menyusun seluruh transisi state on-chain menjadi riwayat kronologis yang transparan.
  getAuditTrail(@Param('sessionId') sessionId: string) {
    
    
    return this.queryService.getPublicView(sessionId).then((view) => ({
      sessionId: view.sessionId,
      auditTrail: [
        { phase: 'Submission', data: view.session },
        { phase: 'Automatic Checks', data: view.automaticCheck },
        { phase: 'Editorial Screening', data: view.editorialScreening },
        { phase: 'Reviewer Selection', data: view.reviewerSelectionBatch },
        { phase: 'Assignment Proofs', data: view.assignmentProofs },
        { phase: 'Review Phase State', data: view.reviewPhase },
        { phase: 'Latest Review Decision', data: view.latestDecision },
      ],
    }));
  }
}
