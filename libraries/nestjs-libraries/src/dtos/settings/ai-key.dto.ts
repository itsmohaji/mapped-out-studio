import { IsIn, IsOptional, IsString } from 'class-validator';

export class AiKeyDto {
  @IsString()
  @IsIn(['openai', 'nano_banana'])
  provider: 'openai' | 'nano_banana';

  @IsOptional()
  @IsString()
  apiKey?: string;
}
