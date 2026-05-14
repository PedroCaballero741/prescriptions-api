import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrescriptionStatus, Role } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { JwtUser } from '../auth/interfaces/jwt-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePrescriptionDto } from './dto/create-prescription.dto';
import { PrescriptionQueryDto } from './dto/prescription-query.dto';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const PRESCRIPTION_INCLUDE = {
  items: true,
  patient: {
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  },
  author: {
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  },
} satisfies Prisma.PrescriptionInclude;

type PrescriptionWithRelations = Prisma.PrescriptionGetPayload<{
  include: typeof PRESCRIPTION_INCLUDE;
}>;

@Injectable()
export class PrescriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForDoctor(doctorUserId: string, input: CreatePrescriptionDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId: doctorUserId },
      select: { id: true },
    });

    if (!doctor) {
      throw new ForbiddenException('Doctor profile not found');
    }

    const patient = await this.prisma.patient.findUnique({
      where: { id: input.patientId },
      select: { id: true },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return this.prisma.prescription.create({
      data: {
        code: input.code,
        notes: input.notes,
        authorId: doctor.id,
        patientId: patient.id,
        items: {
          create: input.items.map((item) => ({
            name: item.name,
            dosage: item.dosage,
            quantity: item.quantity,
            instructions: item.instructions,
          })),
        },
      },
      include: this.getInclude(),
    });
  }

  async listForDoctor(doctorUserId: string, query: PrescriptionQueryDto) {
    if (query.mine === false) {
      throw new ForbiddenException('Doctor can only access own prescriptions');
    }

    const doctor = await this.prisma.doctor.findUnique({
      where: { userId: doctorUserId },
      select: { id: true },
    });

    if (!doctor) {
      throw new ForbiddenException('Doctor profile not found');
    }

    return this.listPrescriptions(query, {
      authorId: doctor.id,
    });
  }

  async getForDoctor(doctorUserId: string, prescriptionId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId: doctorUserId },
      select: { id: true },
    });

    if (!doctor) {
      throw new ForbiddenException('Doctor profile not found');
    }

    const prescription = await this.getPrescriptionOrThrow(prescriptionId);

    if (prescription.authorId !== doctor.id) {
      throw new ForbiddenException('Prescription does not belong to doctor');
    }

    return prescription;
  }

  async getForPatient(patientUserId: string, prescriptionId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId: patientUserId },
      select: { id: true },
    });

    if (!patient) {
      throw new ForbiddenException('Patient profile not found');
    }

    const prescription = await this.getPrescriptionOrThrow(prescriptionId);

    if (prescription.patientId !== patient.id) {
      throw new ForbiddenException('Prescription does not belong to patient');
    }

    return prescription;
  }

  async listForPatient(patientUserId: string, query: PrescriptionQueryDto) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId: patientUserId },
      select: { id: true },
    });

    if (!patient) {
      throw new ForbiddenException('Patient profile not found');
    }

    return this.listPrescriptions(query, {
      patientId: patient.id,
    });
  }

  async consumeForPatient(patientUserId: string, prescriptionId: string) {
    const patient = await this.prisma.patient.findUnique({
      where: { userId: patientUserId },
      select: { id: true },
    });

    if (!patient) {
      throw new ForbiddenException('Patient profile not found');
    }

    const prescription = await this.getPrescriptionOrThrow(prescriptionId);

    if (prescription.patientId !== patient.id) {
      throw new ForbiddenException('Prescription does not belong to patient');
    }

    if (prescription.status === PrescriptionStatus.consumed) {
      throw new BadRequestException('Prescription already consumed');
    }

    return this.prisma.prescription.update({
      where: { id: prescription.id },
      data: {
        status: PrescriptionStatus.consumed,
        consumedAt: new Date(),
      },
      include: this.getInclude(),
    });
  }

  async listForAdmin(query: PrescriptionQueryDto) {
    return this.listPrescriptions(query, {});
  }

  async getPdfForUser(user: JwtUser, prescriptionId: string) {
    const prescription = await this.getPrescriptionOrThrow(prescriptionId);
    await this.assertPdfAccess(user, prescription);

    return {
      filename: `prescription-${this.buildFileToken(prescription.code)}.pdf`,
      content: await this.buildPdf(prescription),
    };
  }

  async getMetrics(from?: string, to?: string) {
    const where = this.buildWhere({ from, to });

    const [
      total,
      consumed,
      pending,
      totalDoctors,
      totalPatients,
      byDayRaw,
      topDoctorsRaw,
    ] = await Promise.all([
      this.prisma.prescription.count({ where }),
      this.prisma.prescription.count({
        where: { ...where, status: PrescriptionStatus.consumed },
      }),
      this.prisma.prescription.count({
        where: { ...where, status: PrescriptionStatus.pending },
      }),
      this.prisma.doctor.count(),
      this.prisma.patient.count(),
      this.prisma.prescription.findMany({
        where,
        select: { createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.prescription.groupBy({
        by: ['authorId'],
        where,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
    ]);

    const byDayMap = new Map<string, number>();
    for (const { createdAt } of byDayRaw) {
      const day = createdAt.toISOString().slice(0, 10);
      byDayMap.set(day, (byDayMap.get(day) ?? 0) + 1);
    }
    const byDay = Array.from(byDayMap.entries()).map(([date, count]) => ({
      date,
      count,
    }));

    const doctorDetails = await this.prisma.doctor.findMany({
      where: { id: { in: topDoctorsRaw.map((d) => d.authorId) } },
      select: { id: true, user: { select: { name: true } } },
    });
    const doctorNameMap = new Map(
      doctorDetails.map((d) => [d.id, d.user.name]),
    );

    const topDoctors = topDoctorsRaw.map((d) => ({
      doctorId: d.authorId,
      name: doctorNameMap.get(d.authorId) ?? 'Unknown',
      count: d._count.id,
    }));

    return {
      from: from ?? null,
      to: to ?? null,
      totals: {
        prescriptions: total,
        doctors: totalDoctors,
        patients: totalPatients,
      },
      byStatus: { pending, consumed },
      byDay,
      topDoctors,
      total,
      consumed,
      pending,
      consumptionRate: total === 0 ? 0 : Number((consumed / total).toFixed(4)),
    };
  }

  private async listPrescriptions(
    query: PrescriptionQueryDto,
    constraints: Prisma.PrescriptionWhereInput,
  ) {
    const page = query.page ?? DEFAULT_PAGE;
    const pageSize = Math.min(
      query.pageSize ?? DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    );
    const where = {
      ...this.buildWhere(query),
      ...constraints,
    };

    const [items, total] = await Promise.all([
      this.prisma.prescription.findMany({
        where,
        include: this.getInclude(),
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: {
          createdAt: query.order ?? 'desc',
        },
      }),
      this.prisma.prescription.count({ where }),
    ]);

    return {
      data: items,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  private buildWhere(query: {
    status?: PrescriptionStatus;
    from?: string;
    to?: string;
  }): Prisma.PrescriptionWhereInput {
    const hasFrom = Boolean(query.from);
    const hasTo = Boolean(query.to);

    if (hasFrom && hasTo && new Date(query.from!) > new Date(query.to!)) {
      throw new BadRequestException('from must be before or equal to to');
    }

    return {
      status: query.status,
      createdAt:
        hasFrom || hasTo
          ? {
              gte: query.from ? new Date(query.from) : undefined,
              lte: query.to ? new Date(query.to) : undefined,
            }
          : undefined,
    };
  }

  private getInclude() {
    return PRESCRIPTION_INCLUDE;
  }

  private async getPrescriptionOrThrow(prescriptionId: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: this.getInclude(),
    });

    if (!prescription) {
      throw new NotFoundException('Prescription not found');
    }

    return prescription;
  }

  private async assertPdfAccess(
    user: JwtUser,
    prescription: PrescriptionWithRelations,
  ) {
    if (user.role === Role.admin) {
      return;
    }

    if (user.role === Role.doctor) {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: user.userId },
        select: { id: true },
      });

      if (!doctor) {
        throw new ForbiddenException('Doctor profile not found');
      }

      if (prescription.authorId !== doctor.id) {
        throw new ForbiddenException('Prescription does not belong to doctor');
      }

      return;
    }

    if (user.role === Role.patient) {
      const patient = await this.prisma.patient.findUnique({
        where: { userId: user.userId },
        select: { id: true },
      });

      if (!patient) {
        throw new ForbiddenException('Patient profile not found');
      }

      if (prescription.patientId !== patient.id) {
        throw new ForbiddenException('Prescription does not belong to patient');
      }

      return;
    }

    throw new ForbiddenException('Role is not allowed to access prescriptions');
  }

  private buildPdf(prescription: PrescriptionWithRelations): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 48 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(20).text('Prescription', { align: 'center' });
      doc.moveDown();

      this.writeSectionTitle(doc, 'Prescription details');
      this.writeField(doc, 'Code', prescription.code);
      this.writeField(doc, 'Date', prescription.createdAt.toISOString());
      this.writeField(doc, 'Status', prescription.status);
      this.writeField(doc, 'Notes', prescription.notes ?? 'N/A');
      doc.moveDown();

      this.writeSectionTitle(doc, 'Patient');
      this.writeField(doc, 'Name', prescription.patient.user.name);
      this.writeField(doc, 'Email', prescription.patient.user.email);
      this.writeField(doc, 'Patient ID', prescription.patient.id);
      this.writeField(
        doc,
        'Birth date',
        prescription.patient.birthDate
          ? prescription.patient.birthDate.toISOString()
          : 'N/A',
      );
      doc.moveDown();

      this.writeSectionTitle(doc, 'Doctor');
      this.writeField(doc, 'Name', prescription.author.user.name);
      this.writeField(doc, 'Email', prescription.author.user.email);
      this.writeField(doc, 'Doctor ID', prescription.author.id);
      this.writeField(doc, 'Specialty', prescription.author.specialty ?? 'N/A');
      doc.moveDown();

      this.writeSectionTitle(doc, 'Items');

      if (prescription.items.length === 0) {
        doc.font('Helvetica').fontSize(11).text('No items');
      } else {
        prescription.items.forEach((item, index) => {
          doc
            .font('Helvetica-Bold')
            .fontSize(11)
            .text(`${index + 1}. ${item.name}`);
          doc.font('Helvetica').fontSize(11);
          doc.text(`Dosage: ${item.dosage ?? 'N/A'}`);
          doc.text(`Quantity: ${item.quantity ?? 'N/A'}`);
          doc.text(`Instructions: ${item.instructions ?? 'N/A'}`);
          doc.moveDown(0.5);
        });
      }

      doc.end();
    });
  }

  private writeSectionTitle(doc: PDFKit.PDFDocument, title: string) {
    doc.font('Helvetica-Bold').fontSize(13).text(title);
    doc.moveDown(0.3);
  }

  private writeField(doc: PDFKit.PDFDocument, label: string, value: string) {
    doc.font('Helvetica-Bold').fontSize(11).text(`${label}: `, {
      continued: true,
    });
    doc.font('Helvetica').fontSize(11).text(value);
  }

  private buildFileToken(code: string): string {
    return code.replace(/[^a-zA-Z0-9_-]/g, '-');
  }
}
