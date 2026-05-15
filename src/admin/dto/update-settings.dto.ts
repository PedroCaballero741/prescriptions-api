import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateSystemSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  platformName?: string;

  @IsOptional()
  @IsEmail()
  supportEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(8)
  prescriptionCodePrefix?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  maxItemsPerPrescription?: number;
}

export class UpdateNotifSettingsDto {
  @IsOptional()
  @IsBoolean()
  notifNewPrescription?: boolean;

  @IsOptional()
  @IsBoolean()
  notifConsumed?: boolean;

  @IsOptional()
  @IsBoolean()
  notifDailyDigest?: boolean;

  @IsOptional()
  @IsBoolean()
  notifWeeklyReport?: boolean;
}
