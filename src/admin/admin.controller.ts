import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { PrescriptionQueryDto } from '../prescriptions/dto/prescription-query.dto';
import { AdminService } from './admin.service';
import { AdminMetricsQueryDto } from './dto/admin-metrics-query.dto';
import {
  UpdateNotifSettingsDto,
  UpdateSystemSettingsDto,
} from './dto/update-settings.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.admin)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('prescriptions')
  listPrescriptions(@Query() query: PrescriptionQueryDto) {
    return this.adminService.listPrescriptions(query);
  }

  @Get('metrics')
  getMetrics(@Query() query: AdminMetricsQueryDto) {
    return this.adminService.getMetrics(query);
  }

  @Get('settings')
  getSettings() {
    return this.adminService.getSettings();
  }

  @Patch('settings/system')
  updateSystemSettings(@Body() dto: UpdateSystemSettingsDto) {
    return this.adminService.updateSystemSettings(dto);
  }

  @Patch('settings/notifications')
  updateNotifSettings(@Body() dto: UpdateNotifSettingsDto) {
    return this.adminService.updateNotifSettings(dto);
  }

  @Get('export')
  async exportCsv(@Res() res: Response) {
    const csv = await this.adminService.exportCsv();
    const filename = `rxflow-export-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Delete('audit-log')
  @HttpCode(200)
  clearAuditLog() {
    return this.adminService.clearAuditLog();
  }
}
