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

  async exportCsv(): Promise<string> {
    const [users, prescriptions] = await Promise.all([
      this.prisma.user.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.prescription.findMany({
        include: {
          patient: {
            select: { user: { select: { name: true, email: true } } },
          },
          author: {
            select: { user: { select: { name: true } }, specialty: true },
          },
          items: true,
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const lines: string[] = [];

    // ── Users section ──────────────────────────────────────────────────────
    lines.push('USERS');
    lines.push(this.csvRow(['id', 'name', 'email', 'role', 'createdAt']));
    for (const u of users) {
      lines.push(
        this.csvRow([u.id, u.name, u.email, u.role, u.createdAt.toISOString()]),
      );
    }

    lines.push('');

    // ── Prescriptions section ──────────────────────────────────────────────
    lines.push('PRESCRIPTIONS');
    lines.push(
      this.csvRow([
        'id',
        'code',
        'status',
        'createdAt',
        'consumedAt',
        'patientName',
        'patientEmail',
        'doctorName',
        'specialty',
        'items',
      ]),
    );
    for (const rx of prescriptions) {
      const itemsSummary = rx.items
        .map(
          (i) =>
            `${i.name}${i.dosage ? ' ' + i.dosage : ''}${i.quantity ? ' x' + i.quantity : ''}`,
        )
        .join(' | ');
      lines.push(
        this.csvRow([
          rx.id,
          rx.code,
          rx.status,
          rx.createdAt.toISOString(),
          rx.consumedAt?.toISOString() ?? '',
          rx.patient.user.name,
          rx.patient.user.email,
          rx.author.user.name,
          rx.author.specialty ?? '',
          itemsSummary,
        ]),
      );
    }

    return lines.join('\n');
  }

  async clearAuditLog(): Promise<{ deleted: number }> {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);

    const { count } = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    return { deleted: count };
  }

  private csvRow(fields: string[]): string {
    return fields
      .map((f) => {
        const s = String(f ?? '');
        // Wrap in quotes if contains comma, quote, or newline
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      })
      .join(',');
  }
}
