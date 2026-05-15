import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtUser } from '../auth/interfaces/jwt-user.interface';
import { PatientsService } from './patients.service';

@Controller('patients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin, Role.doctor)
export class PatientsDirectoryController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  list(
    @Req() req: Request & { user: JwtUser },
    @Query() query: PaginationQueryDto,
  ) {
    return this.patientsService.listPatientDirectory(req.user, query);
  }
}
