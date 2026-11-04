import { Module } from '@nestjs/common';
import { QueryController } from './query.controller';
import { QueryService } from './query.service';
import { ContractsModule } from '../contracts/contracts.module';
import { BlockchainModule } from '../blockchain/blockchain.module';

@Module({
  imports: [ContractsModule, BlockchainModule],
  controllers: [QueryController],
  providers: [QueryService],
  exports: [QueryService],
})
export class QueryModule {}
