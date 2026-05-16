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

  private async resolvePatientRef(
    input: CreatePrescriptionDto,
  ): Promise<string> {
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

  private async ensureUniquePrescriptionCode(
    desired?: string,
  ): Promise<string> {
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

    throw new BadRequestException(
      'Could not allocate a unique prescription code',
    );
  }

  private buildWhere(
    query: PrescriptionQueryDto,
  ): Prisma.PrescriptionWhereInput {
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
    const appPublicUrl = process.env.APP_PUBLIC_URL?.trim();
    const appOrigin = process.env.APP_ORIGIN
      ?.split(',')
      .map((origin) => origin.trim())
      .find((origin) => origin.length > 0 && !origin.includes('*'));
    const qrBaseUrl = appPublicUrl || appOrigin || 'http://localhost:3000';
    const qrUrl = `${qrBaseUrl}/rx/${prescription.code}`;
    const qrBuffer = await QRCode.toBuffer(qrUrl, {
      width: 90,
      margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 0,
        autoFirstPage: true,
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ── Layout constants ─────────────────────────────────────────────────
      const L = 15; // left edge
      const T = 15; // top edge
      const W = 565; // content width  (595.28 − 30)
      const PAGE_H = 841; // A4 height

      // Row heights
      const H_FORM = 18;
      const H_PAT_H = 14; // patient section headers
      const H_PAT_D = 18; // patient section data
      const H_MED_H = 13; // medication column header
      const H_DET_H = 13; // detail row header (DOSIS, VIA…)
      const H_DET_D = 14; // detail row data
      const H_SPAN = 14; // posology / recommendations rows
      const H_FOOTER = 20;
      const H_ORDER = 26;

      // Column layouts
      const FW = W - 78; // formula section width (QR takes 78pt)
      const F1 = [55, 100, 125, FW - 280] as const; // row-1 formula cols
      const P1 = [40, 315, 120, 90] as const; // patient row 1
      const P2 = [65, 100, 45, 70, 285] as const; // patient row 2
      // Medication header cols: NUM | MED NAME | CONCENTRACIÓN | FORMA FARMACÉUTICA
      const MA = [22, 198, 168, W - 22 - 198 - 168] as const;
      // Detail cols (full W, no num offset): DOSIS|VIA|FREC|TIEMPO|CANTIDAD|LETRAS
      const MB = [55, 75, 55, 70, 65, W - 320] as const;

      let y = T;
      let x: number;

      // ── TITLE ─────────────────────────────────────────────────────────────
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor('#000000')
        .text('FORMULACIÓN MEDICAMENTOS', L, y + 5, {
          width: W,
          align: 'center',
          lineBreak: false,
        });

      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#000000')
        .text('Página 1 de 1', L, y + 5, {
          width: W,
          align: 'right',
          lineBreak: false,
        });

      y += 18;

      const genDate = new Date().toLocaleString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      doc
        .font('Helvetica')
        .fontSize(7)
        .text(`Fecha generación: ${genDate}`, L, y, {
          width: W,
          align: 'right',
          lineBreak: false,
        });

      y += 10;

      // ── FORMULA TABLE ─────────────────────────────────────────────────────
      const formY = y;
      const qrH = H_FORM * 2; // QR cell spans both formula rows
      const QR_SIZE = qrH - 4;

      // Row 1: FÓRMULA | code | FECHA DE PRESCRIPCIÓN | date
      x = L;
      this.pdfCell(doc, x, y, F1[0], H_FORM, 'FÓRMULA');
      x += F1[0];
      this.pdfCell(doc, x, y, F1[1], H_FORM, prescription.code, {
        bold: true,
        size: 8,
      });
      x += F1[1];
      this.pdfCell(doc, x, y, F1[2], H_FORM, 'FECHA DE PRESCRIPCIÓN');
      x += F1[2];
      const prescDateStr = prescription.createdAt.toLocaleString('es-CO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
      this.pdfCell(doc, x, y, F1[3], H_FORM, prescDateStr, { size: 7 });

      // QR cell — spans both formula rows
      const qrCellX = L + FW;
      doc.lineWidth(0.4).rect(qrCellX, formY, 78, qrH).stroke('#000000');
      doc.image(qrBuffer, qrCellX + (78 - QR_SIZE) / 2, formY + 2, {
        width: QR_SIZE,
        height: QR_SIZE,
      });

      y += H_FORM;

      // Row 2: ESM | institution
      x = L;
      this.pdfCell(doc, x, y, 120, H_FORM, 'ESM QUE GENERA LA FÓRMULA');
      x += 120;
      this.pdfCell(doc, x, y, FW - 120, H_FORM, 'RxFlow Medical Platform', {
        bold: true,
        size: 8,
      });

      y += H_FORM + 5;

      // ── PATIENT TABLE ─────────────────────────────────────────────────────
      // Header row 1
      x = L;
      (
        [
          'GRADO',
          'APELLIDOS Y NOMBRES DEL PACIENTE',
          'EDAD',
          'CAUSA EXTERNA',
        ] as const
      ).forEach((h, i) => {
        this.pdfCell(doc, x, y, P1[i], H_PAT_H, h, { bold: true });
        x += P1[i];
      });
      y += H_PAT_H;

      // Data row 1
      const age = prescription.patient.birthDate
        ? this.calculateAge(prescription.patient.birthDate)
        : 'No registra';
      x = L;
      this.pdfCell(doc, x, y, P1[0], H_PAT_D, '');
      x += P1[0];
      this.pdfCell(
        doc,
        x,
        y,
        P1[1],
        H_PAT_D,
        prescription.patient.user.name.toUpperCase(),
        {
          bold: true,
          size: 8,
        },
      );
      x += P1[1];
      this.pdfCell(doc, x, y, P1[2], H_PAT_D, age, { size: 7 });
      x += P1[2];
      this.pdfCell(doc, x, y, P1[3], H_PAT_D, '');
      y += H_PAT_D;

      // Header row 2
      x = L;
      (
        [
          'AFILIACIÓN',
          'CENTRO DE COSTOS',
          'ARL',
          'EPS',
          'LUGAR PRESCRIPCIÓN',
        ] as const
      ).forEach((h, i) => {
        this.pdfCell(doc, x, y, P2[i], H_PAT_H, h, { bold: true });
        x += P2[i];
      });
      y += H_PAT_H;

      // Data row 2
      x = L;
      (
        [
          'Beneficiario',
          prescription.patient.user.email,
          'No registra',
          'No registra',
          '',
        ] as const
      ).forEach((d, i) => {
        this.pdfCell(doc, x, y, P2[i], H_PAT_D, d, { size: 7 });
        x += P2[i];
      });
      y += H_PAT_D + 4;

      // ── MEDICATIONS ───────────────────────────────────────────────────────
      prescription.items.forEach((item, idx) => {
        // Estimate space needed; add page if required
        const estH = H_MED_H + 22 + H_DET_H + H_DET_D + H_SPAN + H_SPAN + 4;
        if (y + estH > PAGE_H - 80) {
          doc.addPage({ size: 'A4', margin: 0 });
          y = T;
        }

        const medStartY = y;

        // ── Med header row (skip NUM col — drawn separately spanning 2 rows)
        x = L + MA[0];
        this.pdfCell(
          doc,
          x,
          y,
          MA[1],
          H_MED_H,
          'MEDICAMENTO EN NOMBRE GENÉRICO',
          { bold: true },
        );
        x += MA[1];
        this.pdfCell(doc, x, y, MA[2], H_MED_H, 'CONCENTRACIÓN', {
          bold: true,
        });
        x += MA[2];
        this.pdfCell(doc, x, y, MA[3], H_MED_H, 'FORMA FARMACÉUTICA', {
          bold: true,
        });
        y += H_MED_H;

        // ── Med name row (skip NUM col)
        x = L + MA[0];
        const nameH = this.pdfCellWrap(
          doc,
          x,
          y,
          MA[1],
          18,
          item.name.toUpperCase(),
          {
            bold: true,
            size: 8,
          },
        );
        x += MA[1];
        this.pdfCellWrap(doc, x, y, MA[2], nameH, item.dosage ?? '', {
          size: 7.5,
        });
        x += MA[2];
        this.pdfCellWrap(doc, x, y, MA[3], nameH, '', { size: 7.5 });

        // ── NUM cell spanning header + name rows
        const numSpanH = H_MED_H + nameH;
        doc
          .lineWidth(0.4)
          .rect(L, medStartY, MA[0], numSpanH)
          .stroke('#000000');
        doc
          .font('Helvetica-Bold')
          .fontSize(10)
          .fillColor('#000000')
          .text(`${idx + 1}`, L + 2, medStartY + (numSpanH - 10) / 2, {
            width: MA[0] - 4,
            align: 'center',
            lineBreak: false,
          });

        y += nameH;

        // ── Detail header row (full width)
        x = L;
        (
          [
            'DOSIS',
            'VIA ADM.',
            'FREC.',
            'TIEMPO TTO.',
            'CANTIDAD',
            'CANTIDAD EN LETRAS',
          ] as const
        ).forEach((h, i) => {
          this.pdfCell(doc, x, y, MB[i], H_DET_H, h, { bold: true });
          x += MB[i];
        });
        y += H_DET_H;

        // ── Detail data row (full width) — use wrapping to prevent overflow
        const qtyWords = item.quantity ? this.numberToWords(item.quantity) : '';
        const detailData = [
          item.dosage ?? '',
          'ORAL',
          '',
          '',
          item.quantity?.toString() ?? '',
          qtyWords,
        ] as const;
        // Measure max height needed across all cells
        const detH = Math.max(
          H_DET_D,
          ...detailData.map((d, i) =>
            d
              ? Math.ceil(
                  doc
                    .font('Helvetica')
                    .fontSize(8)
                    .heightOfString(d, { width: MB[i] - 6 }),
                ) + 6
              : H_DET_D,
          ),
        );
        x = L;
        detailData.forEach((d, i) => {
          this.pdfCell(doc, x, y, MB[i], detH, d, { size: 8, wrap: true });
          x += MB[i];
        });
        y += detH;

        // ── Posology (full width)
        const posText = item.instructions
          ? `POSOLOGÍA: ${item.instructions}`
          : 'POSOLOGÍA:';
        doc.lineWidth(0.4).rect(L, y, W, H_SPAN).stroke('#000000');
        doc
          .font('Helvetica')
          .fontSize(7)
          .fillColor('#000000')
          .text(posText, L + 3, y + 3, {
            width: W - 6,
            lineBreak: false,
            ellipsis: true,
          });
        y += H_SPAN;

        // ── Recommendations (full width)
        doc.lineWidth(0.4).rect(L, y, W, H_SPAN).stroke('#000000');
        doc
          .font('Helvetica')
          .fontSize(7)
          .fillColor('#000000')
          .text('Recomendaciones:', L + 3, y + 3, {
            width: W - 6,
            lineBreak: false,
          });
        y += H_SPAN;
      });

      // ── NOTES (prescription-level) ────────────────────────────────────────
      if (prescription.notes) {
        if (y + H_SPAN > PAGE_H - 80) {
          doc.addPage({ size: 'A4', margin: 0 });
          y = T;
        }
        doc.lineWidth(0.4).rect(L, y, W, H_SPAN).stroke('#000000');
        doc
          .font('Helvetica')
          .fontSize(7)
          .fillColor('#000000')
          .text(`Notas: ${prescription.notes}`, L + 3, y + 3, {
            width: W - 6,
            lineBreak: false,
            ellipsis: true,
          });
        y += H_SPAN;
      }

      y += 8;

      // ── DOCTOR FOOTER TABLE ───────────────────────────────────────────────
      if (y + H_FOOTER + H_ORDER + 60 > PAGE_H) {
        doc.addPage({ size: 'A4', margin: 0 });
        y = T;
      }

      const DOC_LABEL_W = 80;
      this.pdfCell(doc, L, y, DOC_LABEL_W, H_FOOTER, 'Médico:', {
        bold: false,
      });
      this.pdfCell(
        doc,
        L + DOC_LABEL_W,
        y,
        W - DOC_LABEL_W,
        H_FOOTER,
        `${prescription.author.user.name.toUpperCase()}`,
        { bold: true, size: 8.5 },
      );
      y += H_FOOTER;

      // ── Specialty row ─────────────────────────────────────────────────────
      if (prescription.author.specialty) {
        this.pdfCell(doc, L, y, DOC_LABEL_W, H_FORM, 'Especialidad:');
        this.pdfCell(
          doc,
          L + DOC_LABEL_W,
          y,
          W - DOC_LABEL_W,
          H_FORM,
          prescription.author.specialty,
          { size: 8 },
        );
        y += H_FORM;
      }

      // ── ORDER TEXT ────────────────────────────────────────────────────────
      doc.lineWidth(0.4).rect(L, y, W, H_ORDER).stroke('#000000');
      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor('#000000')
        .text(
          'ORDEN VÁLIDA POR 3 DÍAS (72 HORAS) HÁBILES. PACIENTE PRESENTAR DOCUMENTO DE IDENTIDAD EN FARMACIA. VERIFICAR MEDICAMENTOS DESPACHADOS ANTES DE RETIRARSE.',
          L + 3,
          y + 5,
          { width: W - 6, align: 'center', lineBreak: true },
        );
      y += H_ORDER + 10;

      // ── SIGNATURE + LICENSE + QR ──────────────────────────────────────────
      const SIG_W = 180;
      const SIG_H = 55;
      const LIC_W = 80;
      const LIC_H = 100;
      const QR_BOT_SIZE = 70;
      const QR_BOT_X = L + W - QR_BOT_SIZE;

      // Signature block
      if (prescription.author.signatureImage) {
        const sigPath = join(
          process.cwd(),
          'uploads',
          'doctors',
          prescription.author.id,
          prescription.author.signatureImage,
        );
        if (existsSync(sigPath)) {
          try {
            doc.image(sigPath, L, y, {
              width: SIG_W,
              height: SIG_H,
              fit: [SIG_W, SIG_H],
            });
          } catch {
            /* skip unreadable */
          }
        }
      } else if (prescription.author.signatureText) {
        doc
          .font('Helvetica-Oblique')
          .fontSize(20)
          .fillColor('#000000')
          .text(prescription.author.signatureText, L, y + 8, {
            width: SIG_W,
            lineBreak: false,
          });
      }

      doc
        .moveTo(L, y + SIG_H)
        .lineTo(L + SIG_W, y + SIG_H)
        .lineWidth(0.5)
        .stroke('#000000');

      doc
        .font('Helvetica')
        .fontSize(7)
        .fillColor('#555555')
        .text('Firma del Médico', L, y + SIG_H + 3, {
          width: SIG_W,
          align: 'center',
          lineBreak: false,
        });

      // License image (right of signature)
      if (prescription.author.licenseImage) {
        const licPath = join(
          process.cwd(),
          'uploads',
          'doctors',
          prescription.author.id,
          prescription.author.licenseImage,
        );
        if (existsSync(licPath)) {
          try {
            const licX = L + SIG_W + 20;
            doc.image(licPath, licX, y, {
              width: LIC_W,
              height: LIC_H,
              cover: [LIC_W, LIC_H],
            });
            doc
              .font('Helvetica')
              .fontSize(6.5)
              .fillColor('#888888')
              .text('Cédula Profesional', licX, y + LIC_H + 2, {
                width: LIC_W,
                align: 'center',
                lineBreak: false,
              });
          } catch {
            /* skip */
          }
        }
      }

      // QR bottom-right
      doc.image(qrBuffer, QR_BOT_X, y, {
        width: QR_BOT_SIZE,
        height: QR_BOT_SIZE,
      });
      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor('#888888')
        .text('Escanea para verificar', QR_BOT_X, y + QR_BOT_SIZE + 2, {
          width: QR_BOT_SIZE,
          align: 'center',
          lineBreak: false,
        });

      y += Math.max(SIG_H + 18, LIC_H + 12) + 10;

      doc.end();
    });
  }

  // ── PDF layout helpers ────────────────────────────────────────────────────

  /** Draw a bordered cell and optionally write text inside it. */
  private pdfCell(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    opts: {
      size?: number;
      bold?: boolean;
      align?: 'left' | 'center' | 'right';
      pad?: number;
      wrap?: boolean;
      valign?: 'top' | 'middle';
    } = {},
  ) {
    const {
      size = 7.5,
      bold = false,
      align = 'left',
      pad = 3,
      wrap = false,
      valign = 'top',
    } = opts;

    doc.lineWidth(0.4).rect(x, y, w, h).stroke('#000000');

    if (!text) return;

    const textY =
      valign === 'middle' ? y + Math.max(pad, (h - size * 1.2) / 2) : y + pad;

    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(size)
      .fillColor('#000000')
      .text(text, x + pad, textY, {
        width: w - pad * 2,
        align,
        lineBreak: wrap,
        ellipsis: !wrap,
      });
  }

  /** Draw a cell that wraps text and returns the actual rendered height (min h). */
  private pdfCellWrap(
    doc: PDFKit.PDFDocument,
    x: number,
    y: number,
    w: number,
    minH: number,
    text: string,
    opts: { size?: number; bold?: boolean; pad?: number } = {},
  ): number {
    const { size = 7.5, bold = false, pad = 3 } = opts;

    // Measure text height
    const measured = doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(size)
      .heightOfString(text, { width: w - pad * 2 });

    const h = Math.max(minH, measured + pad * 2);

    doc.lineWidth(0.4).rect(x, y, w, h).stroke('#000000');

    doc
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(size)
      .fillColor('#000000')
      .text(text, x + pad, y + pad, { width: w - pad * 2, lineBreak: true });

    return h;
  }

  private calculateAge(birthDate: Date): string {
    const now = new Date();
    let years = now.getFullYear() - birthDate.getFullYear();
    let months = now.getMonth() - birthDate.getMonth();
    const days = now.getDate() - birthDate.getDate();
    if (days < 0) months--;
    if (months < 0) {
      years--;
      months += 12;
    }
    return `${years} Años / ${Math.abs(months)} Meses / ${Math.abs(days)} Días`;
  }

  private numberToWords(n: number): string {
    if (!n || n <= 0) return '';
    if (n > 999) return n.toString();
    const ones = [
      '',
      'UNO',
      'DOS',
      'TRES',
      'CUATRO',
      'CINCO',
      'SEIS',
      'SIETE',
      'OCHO',
      'NUEVE',
      'DIEZ',
      'ONCE',
      'DOCE',
      'TRECE',
      'CATORCE',
      'QUINCE',
      'DIECISÉIS',
      'DIECISIETE',
      'DIECIOCHO',
      'DIECINUEVE',
    ];
    const tens = [
      '',
      '',
      'VEINTE',
      'TREINTA',
      'CUARENTA',
      'CINCUENTA',
      'SESENTA',
      'SETENTA',
      'OCHENTA',
      'NOVENTA',
    ];
    const hundreds = [
      '',
      'CIEN',
      'DOSCIENTOS',
      'TRESCIENTOS',
      'CUATROCIENTOS',
      'QUINIENTOS',
      'SEISCIENTOS',
      'SETECIENTOS',
      'OCHOCIENTOS',
      'NOVECIENTOS',
    ];
    if (n < 20) return ones[n];
    if (n === 21) return 'VEINTIUNO';
    if (n < 30) return 'VEINTI' + ones[n - 20];
    if (n < 100)
      return tens[Math.floor(n / 10)] + (n % 10 ? ' Y ' + ones[n % 10] : '');
    if (n === 100) return 'CIEN';
    return (
      hundreds[Math.floor(n / 100)] +
      (n % 100 ? ' ' + this.numberToWords(n % 100) : '')
    );
  }

  private buildFileToken(code: string): string {
    return code.replace(/[^a-zA-Z0-9_-]/g, '-');
  }
}
