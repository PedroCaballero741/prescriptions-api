import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { type Request, type Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtUser } from '../auth/interfaces/jwt-user.interface';
import { PrescriptionsService } from './prescriptions.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin, Role.doctor, Role.patient)
@Controller('prescriptions')
export class PrescriptionsController {
  constructor(private readonly prescriptionsService: PrescriptionsService) {}

  @Get(':id/pdf')
  async downloadPrescriptionPdf(
    @Req() req: Request & { user: JwtUser },
    @Param('id') prescriptionId: string,
    @Res() res: Response,
  ) {
    const { content, filename } = await this.prescriptionsService.getPdfForUser(
      req.user,
      prescriptionId,
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  }
}
