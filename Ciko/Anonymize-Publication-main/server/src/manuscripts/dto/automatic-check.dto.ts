import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class AutomaticCheckDto {
  @ApiPropertyOptional({ 
    description: 'The manuscript ID from intake flow, if testing against a previously uploaded manuscript.',
    example: '123e4567-e89b-12d3-a456-426614174000'
  })
  @IsString()
  @IsOptional()
  manuscriptId?: string;

  @ApiPropertyOptional({ type: 'string', format: 'binary', description: 'Alternatively, upload a new PDF file directly' })
  @IsOptional()
  file?: any;
}
