import { IsDateString, IsOptional } from 'class-validator';

export class AdminMetricsQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
