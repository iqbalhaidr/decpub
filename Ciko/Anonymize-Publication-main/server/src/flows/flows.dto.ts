import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, Matches, IsNumber, IsArray, ValidateNested, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

const HexPattern = /^0x[a-fA-F0-9]+$/;
const AddressPattern = /^0x[a-fA-F0-9]{40}$/;
const HashPattern = /^0x[a-fA-F0-9]{64}$/;

export class CreateEphemeralAccountDto {
  @ApiProperty({ description: 'The pseudonym (address) to be created', example: '0x1234567890123456789012345678901234567890' })
  @IsString()
  @IsNotEmpty()
  @Matches(AddressPattern, { message: 'pseudonym must be a valid 42-character hex address starting with 0x' })
  pseudonym: string;

  @ApiProperty({ description: 'The 32-byte sessionId', example: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern, { message: 'sessionId must be a valid 66-character hex string starting with 0x' })
  sessionId: string;

  @ApiProperty({ description: 'Role enum (0 = Author, 1 = Editor, 2 = Reviewer)', example: 0 })
  @IsNumber()
  role: number;

  @ApiProperty({ description: 'The 32-byte identity commitment from permanent account', example: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern, { message: 'identityCommitment must be a valid 66-character hex string' })
  identityCommitment: string;
}

export class SubmitPublicationDto {
  @ApiProperty({ description: 'The 32-byte sessionId', example: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern, { message: 'sessionId must be a valid 66-character hex string' })
  sessionId: string;

  @ApiProperty({ description: 'Author pseudonym address', example: '0x1234567890123456789012345678901234567890' })
  @IsString()
  @IsNotEmpty()
  @Matches(AddressPattern, { message: 'authorPseudonym must be a valid 42-character hex address' })
  authorPseudonym: string;

  @ApiProperty({ description: '32-byte hash of original manuscript', example: '0x1111111111111111111111111111111111111111111111111111111111111111' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  originalManuscriptHash: string;

  @ApiProperty({ description: '32-byte hash of anonymized manuscript', example: '0x2222222222222222222222222222222222222222222222222222222222222222' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  anonymizedManuscriptHash: string;

  @ApiProperty({ description: '32-byte hash of metadata', example: '0x3333333333333333333333333333333333333333333333333333333333333333' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  metadataHash: string;

  @ApiProperty({ description: 'URI to anonymized manuscript', example: 'ipfs://...' })
  @IsString()
  @IsNotEmpty()
  anonymousManuscriptURI: string;

  @ApiProperty({ description: 'URI to anonymous metadata', example: 'ipfs://...' })
  @IsString()
  @IsNotEmpty()
  anonymousMetadataURI: string;
}

export class RecordAutomaticCheckDto {
  @ApiProperty({ description: 'The 32-byte sessionId', example: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  sessionId: string;

  @ApiProperty({ description: '32-byte hash of the automatic check report', example: '0x4444444444444444444444444444444444444444444444444444444444444444' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  reportHash: string;

  @ApiProperty({ description: '32-byte hash of the flags', example: '0x5555555555555555555555555555555555555555555555555555555555555555' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  flagsHash: string;

  @ApiProperty({ description: 'URI to the report', example: 'ipfs://...' })
  @IsString()
  @IsNotEmpty()
  reportURI: string;

  @ApiProperty({ description: 'Result enum (0=None, 1=Pass, 2=Incomplete, 3=Reject)', example: 1 })
  @IsNumber()
  result: number;
}

export class ProcessAnonymizationDto {
  @ApiProperty({ description: 'The 32-byte sessionId', example: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  sessionId: string;

  @ApiProperty({ description: '32-byte hash of anonymized manuscript', example: '0x2222222222222222222222222222222222222222222222222222222222222222' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  anonymizedManuscriptHash: string;

  @ApiProperty({ description: '32-byte hash of anonymized metadata', example: '0x3333333333333333333333333333333333333333333333333333333333333333' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  metadataHash: string;

  @ApiProperty({ description: 'URI to anonymized manuscript', example: 'ipfs://...' })
  @IsString()
  @IsNotEmpty()
  anonymousManuscriptURI: string;

  @ApiProperty({ description: 'URI to anonymous metadata', example: 'ipfs://...' })
  @IsString()
  @IsNotEmpty()
  anonymousMetadataURI: string;

  @ApiProperty({ description: 'Optional summary or note of anonymization process', required: false, example: 'All author names removed.' })
  @IsString()
  @IsOptional()
  anonymizationSummary?: string;
}

export class AssignEditorDto {
  @ApiProperty({ description: 'The 32-byte sessionId', example: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  sessionId: string;

  @ApiProperty({ description: 'Editor pseudonym address', example: '0x1234567890123456789012345678901234567890' })
  @IsString()
  @IsNotEmpty()
  @Matches(AddressPattern, { message: 'editorPseudonym must be a valid 42-character hex address' })
  editorPseudonym: string;
}

export class RecordEditorialScreeningDto {
  @ApiProperty({ description: 'The 32-byte sessionId', example: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  sessionId: string;

  @ApiProperty({ description: 'Editor pseudonym address', example: '0x1234567890123456789012345678901234567890' })
  @IsString()
  @IsNotEmpty()
  @Matches(AddressPattern)
  editorPseudonym: string;

  @ApiProperty({ description: '32-byte hash of original editorial report', example: '0x1111111111111111111111111111111111111111111111111111111111111111' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  originalEditorialReportHash: string;

  @ApiProperty({ description: '32-byte hash of anonymized editorial report', example: '0x2222222222222222222222222222222222222222222222222222222222222222' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  anonymizedEditorialReportHash: string;

  @ApiProperty({ description: 'URI to anonymized editorial report', example: 'ipfs://...' })
  @IsString()
  @IsNotEmpty()
  anonymizedEditorialReportURI: string;

  @ApiProperty({ description: 'Decision enum (1=ProceedToReviewerSelection, 2=ReviseBeforeReview, 3=DeskReject)', example: 1 })
  @IsNumber()
  decision: number;
}

export class RecordReviewerSelectionDto {
  @ApiProperty({ description: 'The 32-byte sessionId', example: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  sessionId: string;

  @ApiProperty({ description: '32-byte hash of reviewer selection criteria', example: '0x1111111111111111111111111111111111111111111111111111111111111111' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  criteriaHash: string;

  @ApiProperty({ description: 'Target number of reviewers', example: 3 })
  @IsNumber()
  reviewerCount: number;

  @ApiProperty({ description: 'Array of 32-byte reviewer assignment commitments', type: [String] })
  @IsString({ each: true })
  @Matches(HashPattern, { each: true })
  reviewerAssignmentCommitments: string[];
}

export class RecordEditorAssignmentProofDto {
  @ApiProperty({ description: 'The 32-byte sessionId', example: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  sessionId: string;

  @ApiProperty({ description: 'Editor pseudonym address', example: '0x1234567890123456789012345678901234567890' })
  @IsString()
  @IsNotEmpty()
  @Matches(AddressPattern)
  editorPseudonym: string;

  @ApiProperty({ description: '32-byte proof reference hash', example: '0x2222222222222222222222222222222222222222222222222222222222222222' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  proofRef: string;
}

export class ReviewerAssignmentItemDto {
  @ApiProperty({ description: '32-byte reviewer assignment commitment', example: '0x1111111111111111111111111111111111111111111111111111111111111111' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  reviewerAssignmentCommitment: string;

  @ApiProperty({ description: '32-byte invite reference hash (Optional: Server will auto-generate stealth invite if empty)', example: '0x2222222222222222222222222222222222222222222222222222222222222222', required: false })
  @IsString()
  @IsOptional()
  @Matches(HashPattern)
  inviteRef?: string;

  @ApiProperty({ description: '32-byte proof reference hash', example: '0x3333333333333333333333333333333333333333333333333333333333333333' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  proofRef: string;
}

export class BatchRecordReviewerAssignmentProofsDto {
  @ApiProperty({ description: 'The 32-byte sessionId', example: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  sessionId: string;

  @ApiProperty({ description: 'Array of assignments', type: [ReviewerAssignmentItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewerAssignmentItemDto)
  assignments: ReviewerAssignmentItemDto[];
}

export class SetReviewPhaseDto {
  @ApiProperty({ description: 'The 32-byte sessionId', example: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  sessionId: string;

  @ApiProperty({ description: 'Phase enum (1=Commit, 2=Reveal, 3=Closed)', example: 1 })
  @IsNumber()
  phase: number;
}

export class CommitReviewDto {
  @ApiProperty({ description: 'The 32-byte sessionId', example: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  sessionId: string;

  @ApiProperty({ description: 'Reviewer pseudonym address', example: '0x1234567890123456789012345678901234567890' })
  @IsString()
  @IsNotEmpty()
  @Matches(AddressPattern)
  reviewerPseudonym: string;

  @ApiProperty({ description: '32-byte reviewer assignment commitment', example: '0x1111111111111111111111111111111111111111111111111111111111111111' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  reviewerAssignmentCommitment: string;

  @ApiProperty({ description: 'ReviewRecommendation enum (1=Reject, 2=Major, 3=Minor, 4=Accept)', example: 4 })
  @IsNumber()
  recommendation: number;

  @ApiProperty({ description: '32-byte hash of the review report', example: '0x2222222222222222222222222222222222222222222222222222222222222222' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  reviewHash: string;

  @ApiProperty({ description: 'URI to the review report', example: 'ipfs://...' })
  @IsString()
  @IsNotEmpty()
  reviewURI: string;

  @ApiProperty({ description: '32-byte secret nonce', example: '0x3333333333333333333333333333333333333333333333333333333333333333' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  nonce: string;
}

export class RevealReviewDto extends CommitReviewDto {}

export class DecideBatchDto {
  @ApiProperty({ description: 'The 32-byte sessionId', example: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  sessionId: string;

  @ApiProperty({ description: 'Batch number', example: 1 })
  @IsNumber()
  batch: number;

  @ApiProperty({ description: 'Array of reviewer pseudonym addresses', type: [String] })
  @IsString({ each: true })
  @Matches(AddressPattern, { each: true })
  reviewerPseudonyms: string[];

  @ApiProperty({ description: 'Number of additional reviewers if gray zone is reached', example: 2 })
  @IsNumber()
  additionalReviewerCountIfGrayZone: number;
}

export class FinalizePublicationDto {
  @ApiProperty({ description: 'The 32-byte sessionId', example: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef' })
  @IsString()
  @IsNotEmpty()
  @Matches(HashPattern)
  sessionId: string;

  @ApiProperty({ description: 'Optional final manuscript URI', required: false })
  @IsString()
  @IsOptional()
  finalManuscriptURI?: string;

  @ApiProperty({ description: 'Optional final metadata URI', required: false })
  @IsString()
  @IsOptional()
  finalMetadataURI?: string;
}

