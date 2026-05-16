import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { JwtUser } from '../auth/interfaces/jwt-user.interface';
import {
  PaginationQueryDto,
  resolvePagination,
} from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { PrescriptionQueryDto } from '../prescriptions/dto/prescription-query.dto';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';

@Injectable()
export class PatientsService {
  constructor(
    private readonly prescriptionsService: PrescriptionsService,
    private readonly prisma: PrismaService,
  ) {}

  listMyPrescriptions(userId: string, query: PrescriptionQueryDto) {
    return this.prescriptionsService.listForPatient(userId, query);
  }

  getMyPrescription(userId: string, prescriptionId: string) {
    return this.prescriptionsService.getForPatient(userId, prescriptionId);
  }

  consumePrescription(userId: string, prescriptionId: string) {
    return this.prescriptionsService.consumeForPatient(userId, prescriptionId);
  }

  async listPatientDirectory(actor: JwtUser, query: PaginationQueryDto) {
    const { page, pageSize } = resolvePagination(query);
    const q = query.query?.trim();

    const userFilter: Prisma.UserWhereInput | undefined = q
      ? {
          OR: [
            { email: { contains: q, mode: 'insensitive' } },
            { name: { contains: q, mode: 'insensitive' } },
          ],
        }
      : undefined;

    let where: Prisma.PatientWhereInput;

    if (actor.role === Role.admin) {
      where = userFilter ? { user: userFilter } : {};
    } else if (actor.role === Role.doctor) {
      const doctor = await this.prisma.doctor.findUnique({
        where: { userId: actor.userId },
        select: { id: true },
      });
      if (!doctor) {
        throw new ForbiddenException('Doctor profile not found');
      }
      where = {
        prescriptions: { some: { authorId: doctor.id } },
        ...(userFilter ? { user: userFilter } : {}),
      };
    } else {
      throw new ForbiddenException('Role cannot list patients');
    }

    const [data, total] = await Promise.all([
      this.prisma.patient.findMany({
        where,
        select: {
          id: true,
          userId: true,
          birthDate: true,
          user: { select: { email: true, name: true } },
        },
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.patient.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }
}
