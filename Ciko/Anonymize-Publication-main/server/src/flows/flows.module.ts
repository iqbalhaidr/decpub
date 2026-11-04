import { Module } from '@nestjs/common';
import { FlowsController } from './flows.controller';
import { FlowsService } from './flows.service';
import { ContractsModule } from '../contracts/contracts.module';
import { QueryModule } from '../query/query.module';

@Module({
  imports: [ContractsModule, QueryModule],
  controllers: [FlowsController],
  providers: [FlowsService],
  exports: [FlowsService],
})
export class FlowsModule {}
