import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

class CreatePrescriptionItemDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  dosage?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsString()
  instructions?: string;
}

export class CreatePrescriptionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  patientId?: string;

  @IsOptional()
  @IsEmail()
  patientEmail?: string;

  /** If omitted, a unique code is generated server-side. */
  @IsOptional()
  @IsString()
  @MinLength(3)
  code?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePrescriptionItemDto)
  items: CreatePrescriptionItemDto[];
}
