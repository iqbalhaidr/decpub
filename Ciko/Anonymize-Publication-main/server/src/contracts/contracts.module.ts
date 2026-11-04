import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BlockchainModule } from '../blockchain/blockchain.module';
import { ContractsService } from './contracts.service';

@Module({
  imports: [ConfigModule, BlockchainModule],
  providers: [ContractsService],
  exports: [ContractsService],
})
export class ContractsModule {}
