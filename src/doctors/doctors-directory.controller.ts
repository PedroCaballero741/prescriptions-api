import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DoctorsService } from './doctors.service';

@Controller('doctors')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
export class DoctorsDirectoryController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Get()
  list(@Query() query: PaginationQueryDto) {
    return this.doctorsService.listDoctorDirectory(query);
  }
}
