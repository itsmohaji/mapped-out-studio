import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export const CAMPAIGN_STATUSES = [
  'planning',
  'active',
  'completed',
  'archived',
] as const;

export class CreateCampaignDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsIn(CAMPAIGN_STATUSES as unknown as string[]) status?: string;
  @IsOptional() @IsString() @MaxLength(20) color?: string;
  @IsOptional() @IsString() @MaxLength(500) goal?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsString() customerId?: string;
}

export class UpdateCampaignDto extends CreateCampaignDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) name!: string;
}

export class CampaignPostsDto {
  @IsArray() @IsString({ each: true }) groups!: string[];
}
