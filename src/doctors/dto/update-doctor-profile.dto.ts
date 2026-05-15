import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDoctorProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  specialty?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  signatureText?: string;
}
