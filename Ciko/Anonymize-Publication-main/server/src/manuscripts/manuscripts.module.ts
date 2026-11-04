import { Module } from '@nestjs/common';
import { ManuscriptsController } from './manuscripts.controller';
import { ManuscriptsService } from './manuscripts.service';
import { ManuscriptsAnonymizationService } from './manuscripts-anonymization.service';
import { ManuscriptsAutomaticCheckService } from './manuscripts-automatic-check.service';

@Module({
  controllers: [ManuscriptsController],
  providers: [ManuscriptsService, ManuscriptsAnonymizationService, ManuscriptsAutomaticCheckService],
  exports: [ManuscriptsService, ManuscriptsAnonymizationService, ManuscriptsAutomaticCheckService],
})
export class ManuscriptsModule {}
