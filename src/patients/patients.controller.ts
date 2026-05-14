import {
  Controller,
  Get,
  Param,
  Put,
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
import { PrescriptionQueryDto } from '../prescriptions/dto/prescription-query.dto';
import { PatientsService } from './patients.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.patient)
@Controller()
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get('me/prescriptions')
  listMyPrescriptions(
    @Req() req: Request & { user: JwtUser },
    @Query() query: PrescriptionQueryDto,
  ) {
    return this.patientsService.listMyPrescriptions(req.user.userId, query);
  }

  @Get('me/prescriptions/:id')
  getMyPrescription(
    @Req() req: Request & { user: JwtUser },
    @Param('id') prescriptionId: string,
  ) {
    return this.patientsService.getMyPrescription(
      req.user.userId,
      prescriptionId,
    );
  }

  @Put('prescriptions/:id/consume')
  consumePrescription(
    @Req() req: Request & { user: JwtUser },
    @Param('id') prescriptionId: string,
  ) {
    return this.patientsService.consumePrescription(
      req.user.userId,
      prescriptionId,
    );
  }
}
