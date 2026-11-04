import { ApiProperty } from '@nestjs/swagger';

export class PipelineResponseDto<T = any> {
  @ApiProperty()
  message: string;

  @ApiProperty()
  inputReference?: string;

  @ApiProperty()
  hashes: Record<string, string>;

  @ApiProperty()
  paths: Record<string, string>;

  @ApiProperty()
  result: T;

  // Flattened hashes for backward compatibility
  @ApiProperty({ required: false })
  fileHash?: string;

  @ApiProperty({ required: false })
  metadataHash?: string;

  @ApiProperty({ required: false })
  manuscriptId?: string;

  @ApiProperty({ required: false })
  originalManuscriptId?: string;

  @ApiProperty({ required: false })
  metadata?: any;

  @ApiProperty({ required: false })
  anonymizedFileHash?: string;

  @ApiProperty({ required: false })
  anonymizedMetadataHash?: string;

  @ApiProperty({ required: false })
  reportHash?: string;

  @ApiProperty({ required: false })
  flagsHash?: string;

  @ApiProperty({ required: false })
  reportId?: string;

  @ApiProperty({ required: false })
  summary?: any;

  @ApiProperty({ required: false })
  resultCategory?: string;
}
