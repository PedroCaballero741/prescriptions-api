import { Injectable } from '@nestjs/common';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminMetricsQueryDto } from './dto/admin-metrics-query.dto';
import { PrescriptionQueryDto } from '../prescriptions/dto/prescription-query.dto';
import {
  UpdateNotifSettingsDto,
  UpdateSystemSettingsDto,
} from './dto/update-settings.dto';

const SETTINGS_ID = 'singleton';

@Injectable()
export class AdminService {
  constructor(
    private readonly prescriptionsService: PrescriptionsService,
    private readonly prisma: PrismaService,
  ) {}

  listPrescriptions(query: PrescriptionQueryDto) {
    return this.prescriptionsService.listForAdmin(query);
  }

  getMetrics(query: AdminMetricsQueryDto) {
    return this.prescriptionsService.getMetrics(query.from, query.to);
  }

  getSettings() {
    return this.prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID },
      update: {},
    });
  }

  updateSystemSettings(dto: UpdateSystemSettingsDto) {
    return this.prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...dto },
      update: dto,
    });
  }

  updateNotifSettings(dto: UpdateNotifSettingsDto) {
    return this.prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...dto },
      update: dto,
    });
  }
}
