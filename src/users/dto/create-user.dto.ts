import { Role } from '@prisma/client';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsEnum(Role)
  role: Role;

  @IsOptional()
  @IsString()
  @MinLength(1)
  specialty?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;
}
