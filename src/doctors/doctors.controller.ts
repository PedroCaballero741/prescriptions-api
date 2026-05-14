import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtUser } from '../auth/interfaces/jwt-user.interface';
import { CreatePrescriptionDto } from '../prescriptions/dto/create-prescription.dto';
import { PrescriptionQueryDto } from '../prescriptions/dto/prescription-query.dto';
import { DoctorsService } from './doctors.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.doctor)
@Controller()
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Post('prescriptions')
  createPrescription(
    @Req() req: Request & { user: JwtUser },
    @Body() input: CreatePrescriptionDto,
  ) {
    return this.doctorsService.createPrescription(req.user.userId, input);
  }

  @Get('prescriptions')
  listPrescriptions(
    @Req() req: Request & { user: JwtUser },
    @Query() query: PrescriptionQueryDto,
  ) {
    return this.doctorsService.listPrescriptions(req.user.userId, query);
  }

  @Get('prescriptions/:id')
  getPrescription(
    @Req() req: Request & { user: JwtUser },
    @Param('id') prescriptionId: string,
  ) {
    return this.doctorsService.getPrescription(req.user.userId, prescriptionId);
  }
}
