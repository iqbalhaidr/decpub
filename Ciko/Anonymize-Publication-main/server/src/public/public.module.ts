import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { QueryModule } from '../query/query.module';

@Module({
  imports: [QueryModule],
  controllers: [PublicController],
})
export class PublicModule {}
