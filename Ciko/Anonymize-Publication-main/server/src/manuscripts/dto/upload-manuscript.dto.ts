import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';

export class UploadManuscriptDto {
  @ApiProperty({ description: 'The title of the manuscript', example: 'Measuring Bias in Open Source Peer Review' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({ description: 'The name of the author', example: 'John Doe' })
  @IsString()
  @IsNotEmpty()
  authorName: string;

  @ApiProperty({ description: 'The email address of the author', example: 'john.doe@university.edu' })
  @IsEmail()
  @IsNotEmpty()
  authorEmail: string;

  @ApiPropertyOptional({ description: 'The affiliation of the author', example: 'University of Science' })
  @IsString()
  @IsOptional()
  affiliation?: string;

  @ApiProperty({ type: 'string', format: 'binary', description: 'The manuscript file (PDF or DOCX)' })
  @IsOptional()
  file?: any;
}
