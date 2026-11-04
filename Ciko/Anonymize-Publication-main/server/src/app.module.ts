import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BlockchainModule } from './blockchain/blockchain.module';
import { ContractsModule } from './contracts/contracts.module';
import { QueryModule } from './query/query.module';
import { FlowsModule } from './flows/flows.module';
import { PublicModule } from './public/public.module';
import { ManuscriptsModule } from './manuscripts/manuscripts.module';
import appConfig from './config/app.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),
    BlockchainModule,
    ContractsModule,
    QueryModule,
    FlowsModule,
    PublicModule,
    ManuscriptsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
