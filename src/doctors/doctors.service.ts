import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto, resolvePagination } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePrescriptionDto } from '../prescriptions/dto/create-prescription.dto';
import { PrescriptionQueryDto } from '../prescriptions/dto/prescription-query.dto';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';

@Injectable()
export class DoctorsService {
  constructor(
    private readonly prescriptionsService: PrescriptionsService,
    private readonly prisma: PrismaService,
  ) {}

  createPrescription(userId: string, input: CreatePrescriptionDto) {
    return this.prescriptionsService.createForDoctor(userId, input);
  }

  listPrescriptions(userId: string, query: PrescriptionQueryDto) {
    return this.prescriptionsService.listForDoctor(userId, query);
  }

  getPrescription(userId: string, prescriptionId: string) {
    return this.prescriptionsService.getForDoctor(userId, prescriptionId);
  }

  async listDoctorDirectory(query: PaginationQueryDto) {
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

    const where: Prisma.DoctorWhereInput = userFilter
      ? { user: userFilter }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.doctor.findMany({
        where,
        select: {
          id: true,
          userId: true,
          specialty: true,
          user: { select: { email: true, name: true } },
        },
        orderBy: { id: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.doctor.count({ where }),
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
