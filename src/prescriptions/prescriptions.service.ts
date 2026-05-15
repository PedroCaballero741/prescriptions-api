import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PrescriptionStatus, Role } from '@prisma/client';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { randomBytes } from 'crypto';
import { existsSync } from 'fs';
import { join } from 'path';
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

// Include used specifically for PDF generation — adds signature/license fields from doctor
const PDF_PRESCRIPTION_INCLUDE = {
  items: true,
  patient: {
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  },
  author: {
    select: {
      id: true,
      userId: true,
      specialty: true,
      signatureText: true,
      signatureImage: true,
      licenseImage: true,
      user: { select: { id: true, email: true, name: true } },
    },
  },
} satisfies Prisma.PrescriptionInclude;

type PrescriptionForPdf = Prisma.PrescriptionGetPayload<{
  include: typeof PDF_PRESCRIPTION_INCLUDE;
}>;

type PrescriptionWithRelations = Prisma.PrescriptionGetPayload<{
  include: typeof PRESCRIPTION_INCLUDE;
}>;

@Injectable()
export class PrescriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForDoctor(doctorUserId: string, input: CreatePrescriptionDto) {
    const hasId = Boolean(input.patientId?.trim());
    const hasEmail = Boolean(input.patientEmail?.trim());
    if (hasId === hasEmail) {
      throw new BadRequestException(
        'Provide exactly one of patientId or patientEmail',
      );
    }

    const doctor = await this.prisma.doctor.findUnique({
      where: { userId: doctorUserId },
      select: { id: true },
    });

    if (!doctor) {
      throw new ForbiddenException('Doctor profile not found');
    }

    const patientId = await this.resolvePatientRef(input);
    const code = await this.ensureUniquePrescriptionCode(input.code);

    return this.prisma.prescription.create({
      data: {
        code,
        notes: input.notes,
        authorId: doctor.id,
        patientId,
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

  async getPublicByCode(code: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { code },
      select: {
        code: true,
        status: true,
        createdAt: true,
        items: {
          select: {
            id: true,
            name: true,
            dosage: true,
            quantity: true,
            instructions: true,
          },
        },
        author: {
          select: {
            specialty: true,
            user: { select: { name: true } },
          },
        },
      },
    });

    if (!prescription) throw new NotFoundException('Prescription not found');

    return {
      code: prescription.code,
      status: prescription.status,
      issuedAt: prescription.createdAt,
      items: prescription.items,
      doctor: {
        name: prescription.author.user.name,
        specialty: prescription.author.specialty ?? null,
      },
    };
  }

  async getPdfForUser(user: JwtUser, prescriptionId: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { id: prescriptionId },
      include: PDF_PRESCRIPTION_INCLUDE,
    });
    if (!prescription) throw new NotFoundException('Prescription not found');

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
      query.limit ?? query.pageSize ?? DEFAULT_PAGE_SIZE,
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

  private async resolvePatientRef(input: CreatePrescriptionDto): Promise<string> {
    if (input.patientId?.trim()) {
      const patient = await this.prisma.patient.findUnique({
        where: { id: input.patientId.trim() },
        select: { id: true },
      });
      if (!patient) {
        throw new NotFoundException('Patient not found');
      }
      return patient.id;
    }

    const email = input.patientEmail!.trim().toLowerCase();
    const patient = await this.prisma.patient.findFirst({
      where: { user: { email } },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException('Patient not found for this email');
    }
    return patient.id;
  }

  private async ensureUniquePrescriptionCode(desired?: string): Promise<string> {
    if (desired?.trim()) {
      const code = desired.trim();
      const exists = await this.prisma.prescription.findUnique({
        where: { code },
        select: { id: true },
      });
      if (exists) {
        throw new ConflictException('Prescription code already in use');
      }
      return code;
    }

    for (let attempt = 0; attempt < 16; attempt += 1) {
      const code = `RX-${Date.now().toString(36).toUpperCase()}-${randomBytes(5).toString('hex').toUpperCase()}`;
      const exists = await this.prisma.prescription.findUnique({
        where: { code },
        select: { id: true },
      });
      if (!exists) {
        return code;
      }
      await new Promise<void>((resolve) => {
        setImmediate(resolve);
      });
    }

    throw new BadRequestException('Could not allocate a unique prescription code');
  }

  private buildWhere(query: PrescriptionQueryDto): Prisma.PrescriptionWhereInput {
    const hasFrom = Boolean(query.from);
    const hasTo = Boolean(query.to);

    if (hasFrom && hasTo && new Date(query.from!) > new Date(query.to!)) {
      throw new BadRequestException('from must be before or equal to to');
    }

    return {
      status: query.status,
      patientId: query.patientId,
      authorId: query.doctorId,
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

  private async buildPdf(prescription: PrescriptionForPdf): Promise<Buffer> {
    const appOrigin = process.env.APP_ORIGIN ?? 'http://localhost:3000';
    const qrUrl = `${appOrigin}/rx/${prescription.code}`;
    const qrBuffer = await QRCode.toBuffer(qrUrl, {
      width: 96,
      margin: 1,
      color: { dark: '#111827', light: '#ffffff' },
    });

    return new Promise((resolve, reject) => {
      // A4 page, 48pt margins
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ML = 48;          // margin left
      const MR = 48;          // margin right
      const PW = 595.28;      // A4 width
      const CW = PW - ML - MR; // content width ≈ 499
      const QR_SIZE = 90;
      const QR_X = PW - MR - QR_SIZE;

      // ── HEADER ──────────────────────────────────────────────────────────────
      const headerY = doc.y;

      // QR — absolute top-right
      doc.image(qrBuffer, QR_X, headerY, { width: QR_SIZE, height: QR_SIZE });

      // Title block — left side, constrained width to not overlap QR
      const textW = CW - QR_SIZE - 16;
      doc
        .font('Helvetica-Bold')
        .fontSize(20)
        .fillColor('#111827')
        .text('PRESCRIPCIÓN MÉDICA', ML, headerY, { width: textW });

      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor('#6b7280')
        .text('RxFlow Medical Platform', ML, doc.y, { width: textW });

      doc.moveDown(0.5);

      // Code / Date / Status chips
      const date = prescription.createdAt.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });
      const statusLabel =
        prescription.status === PrescriptionStatus.consumed
          ? 'CONSUMIDA'
          : 'PENDIENTE';

      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor('#111827')
        .text(`Código: `, ML, doc.y, { continued: true, width: textW })
        .font('Helvetica')
        .text(prescription.code, { continued: true })
        .font('Helvetica-Bold')
        .text('   Fecha: ', { continued: true })
        .font('Helvetica')
        .text(date, { continued: true })
        .font('Helvetica-Bold')
        .text('   Estado: ', { continued: true })
        .font('Helvetica')
        .fillColor(
          prescription.status === PrescriptionStatus.consumed
            ? '#059669'
            : '#d97706',
        )
        .text(statusLabel);

      // Ensure we're past the QR before drawing the divider
      const afterHeader = Math.max(doc.y, headerY + QR_SIZE) + 12;
      this.drawDivider(doc, ML, afterHeader, PW - MR);

      // ── PATIENT ─────────────────────────────────────────────────────────────
      doc.y = afterHeader + 14;
      this.writeSectionLabel(doc, 'PACIENTE', ML);
      doc.moveDown(0.4);

      const patient = prescription.patient;
      this.writeRow(doc, 'Nombre', patient.user.name, ML, CW);
      this.writeRow(doc, 'Email', patient.user.email, ML, CW);
      this.writeRow(
        doc,
        'Fecha de nacimiento',
        patient.birthDate
          ? patient.birthDate.toLocaleDateString('es-MX', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })
          : 'No registrada',
        ML,
        CW,
      );

      doc.moveDown(0.6);
      this.drawDivider(doc, ML, doc.y, PW - MR);

      // ── MEDICATIONS ─────────────────────────────────────────────────────────
      doc.moveDown(0.6);
      this.writeSectionLabel(doc, 'MEDICAMENTOS', ML);
      doc.moveDown(0.4);

      if (prescription.items.length === 0) {
        doc.font('Helvetica').fontSize(10).fillColor('#6b7280').text('Sin items registrados.', ML);
      } else {
        prescription.items.forEach((item, i) => {
          const itemY = doc.y;
          // Item number circle background
          doc
            .roundedRect(ML, itemY, CW, 1, 0)
            .fillColor('#f9fafb');

          doc
            .font('Helvetica-Bold')
            .fontSize(11)
            .fillColor('#111827')
            .text(`${i + 1}. ${item.name}`, ML, itemY, { width: CW });

          doc.font('Helvetica').fontSize(9.5).fillColor('#374151');

          const parts: string[] = [];
          if (item.dosage) parts.push(`Dosis: ${item.dosage}`);
          if (item.quantity) parts.push(`Cantidad: ${item.quantity}`);
          if (parts.length) doc.text(parts.join('   ·   '), ML, doc.y, { width: CW });

          if (item.instructions) {
            doc
              .fillColor('#6b7280')
              .text(`Indicaciones: ${item.instructions}`, ML, doc.y, { width: CW });
          }

          if (i < prescription.items.length - 1) doc.moveDown(0.5);
        });
      }

      // Notes
      if (prescription.notes) {
        doc.moveDown(0.6);
        this.drawDivider(doc, ML, doc.y, PW - MR);
        doc.moveDown(0.6);
        this.writeSectionLabel(doc, 'NOTAS', ML);
        doc.moveDown(0.3);
        doc
          .font('Helvetica-Oblique')
          .fontSize(10)
          .fillColor('#374151')
          .text(prescription.notes, ML, doc.y, { width: CW });
      }

      // ── DOCTOR FOOTER ────────────────────────────────────────────────────────
      doc.moveDown(1);
      this.drawDivider(doc, ML, doc.y, PW - MR);
      doc.moveDown(0.7);

      const footerY = doc.y;
      const author = prescription.author;

      // License image — right side
      const LICENSE_W = 80;
      const LICENSE_H = 100;
      const licenseX = PW - MR - LICENSE_W;
      let licenseDrawn = false;

      if (author.licenseImage) {
        const licensePath = join(
          process.cwd(),
          'uploads',
          'doctors',
          author.id,
          author.licenseImage,
        );
        if (existsSync(licensePath)) {
          try {
            doc.image(licensePath, licenseX, footerY, {
              width: LICENSE_W,
              height: LICENSE_H,
              cover: [LICENSE_W, LICENSE_H],
            });
            doc
              .font('Helvetica')
              .fontSize(7)
              .fillColor('#9ca3af')
              .text('Cédula Profesional', licenseX, footerY + LICENSE_H + 2, {
                width: LICENSE_W,
                align: 'center',
              });
            licenseDrawn = true;
          } catch {
            // skip if image unreadable
          }
        }
      }

      // Doctor text — left side, constrained width
      const doctorTextW = licenseDrawn ? CW - LICENSE_W - 16 : CW;

      doc
        .font('Helvetica-Bold')
        .fontSize(12)
        .fillColor('#111827')
        .text(`Dr. ${author.user.name}`, ML, footerY, { width: doctorTextW });

      if (author.specialty) {
        doc
          .font('Helvetica')
          .fontSize(10)
          .fillColor('#6b7280')
          .text(author.specialty, ML, doc.y, { width: doctorTextW });
      }

      doc.moveDown(0.8);

      // Signature
      const sigY = doc.y;
      const SIG_W = 160;
      const SIG_H = 56;

      if (author.signatureImage) {
        const sigPath = join(
          process.cwd(),
          'uploads',
          'doctors',
          author.id,
          author.signatureImage,
        );
        if (existsSync(sigPath)) {
          try {
            doc.image(sigPath, ML, sigY, { width: SIG_W, height: SIG_H, fit: [SIG_W, SIG_H] });
            doc.y = sigY + SIG_H + 4;
          } catch {
            this.drawSignatureLine(doc, ML, sigY, SIG_W);
          }
        } else {
          this.drawSignatureLine(doc, ML, sigY, SIG_W);
        }
      } else if (author.signatureText) {
        doc
          .font('Helvetica-Oblique')
          .fontSize(18)
          .fillColor('#374151')
          .text(author.signatureText, ML, sigY, { width: SIG_W });
        doc.y = doc.y + 4;
        this.drawSignatureLine(doc, ML, doc.y, SIG_W);
      } else {
        this.drawSignatureLine(doc, ML, sigY, SIG_W);
        doc.y = sigY + SIG_H;
      }

      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#9ca3af')
        .text('Firma del Médico', ML, doc.y + 2, { width: SIG_W, align: 'left' });

      // QR label below QR
      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#9ca3af')
        .text('Escanea para verificar', QR_X, headerY + QR_SIZE + 2, {
          width: QR_SIZE,
          align: 'center',
        });

      doc.end();
    });
  }

  private drawDivider(doc: PDFKit.PDFDocument, x1: number, y: number, x2: number) {
    doc.moveTo(x1, y).lineTo(x2, y).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
    doc.lineWidth(1).strokeColor('#000000'); // reset
  }

  private drawSignatureLine(doc: PDFKit.PDFDocument, x: number, y: number, width: number) {
    doc.moveTo(x, y + 40).lineTo(x + width, y + 40).strokeColor('#9ca3af').lineWidth(0.8).stroke();
    doc.lineWidth(1).strokeColor('#000000');
  }

  private writeSectionLabel(doc: PDFKit.PDFDocument, label: string, x: number) {
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor('#6b7280')
      .text(label, x, doc.y, { characterSpacing: 1.2 });
    doc.fillColor('#111827');
  }

  private writeRow(
    doc: PDFKit.PDFDocument,
    label: string,
    value: string,
    x: number,
    width: number,
  ) {
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor('#374151')
      .text(`${label}: `, x, doc.y, { continued: true, width })
      .font('Helvetica')
      .fillColor('#111827')
      .text(value);
  }

  private buildFileToken(code: string): string {
    return code.replace(/[^a-zA-Z0-9_-]/g, '-');
  }
}
