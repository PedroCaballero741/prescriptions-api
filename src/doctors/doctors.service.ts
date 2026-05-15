import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { PaginationQueryDto, resolvePagination } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePrescriptionDto } from '../prescriptions/dto/create-prescription.dto';
import { PrescriptionQueryDto } from '../prescriptions/dto/prescription-query.dto';
import { PrescriptionsService } from '../prescriptions/prescriptions.service';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto';

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

  async getProfile(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId },
      select: {
        id: true,
        specialty: true,
        signatureText: true,
        signatureImage: true,
        licenseImage: true,
        user: { select: { name: true, email: true } },
      },
    });
    if (!doctor) throw new NotFoundException('Doctor profile not found');
    return doctor;
  }

  async updateProfile(userId: string, dto: UpdateDoctorProfileDto) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!doctor) throw new NotFoundException('Doctor profile not found');

    return this.prisma.doctor.update({
      where: { id: doctor.id },
      data: dto,
      select: {
        id: true,
        specialty: true,
        signatureText: true,
        signatureImage: true,
        licenseImage: true,
        user: { select: { name: true, email: true } },
      },
    });
  }

  async saveSignatureImage(userId: string, filename: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId },
      select: { id: true, signatureImage: true },
    });
    if (!doctor) throw new NotFoundException('Doctor profile not found');
    this.removeFile(doctor.id, doctor.signatureImage);
    return this.prisma.doctor.update({
      where: { id: doctor.id },
      data: { signatureImage: filename },
      select: { signatureImage: true },
    });
  }

  async saveLicenseImage(userId: string, filename: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId },
      select: { id: true, licenseImage: true },
    });
    if (!doctor) throw new NotFoundException('Doctor profile not found');
    this.removeFile(doctor.id, doctor.licenseImage);
    return this.prisma.doctor.update({
      where: { id: doctor.id },
      data: { licenseImage: filename },
      select: { licenseImage: true },
    });
  }

  async removeSignatureImage(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId },
      select: { id: true, signatureImage: true },
    });
    if (!doctor) throw new NotFoundException('Doctor profile not found');
    this.removeFile(doctor.id, doctor.signatureImage);
    await this.prisma.doctor.update({
      where: { id: doctor.id },
      data: { signatureImage: null },
    });
  }

  async removeLicenseImage(userId: string) {
    const doctor = await this.prisma.doctor.findUnique({
      where: { userId },
      select: { id: true, licenseImage: true },
    });
    if (!doctor) throw new NotFoundException('Doctor profile not found');
    this.removeFile(doctor.id, doctor.licenseImage);
    await this.prisma.doctor.update({
      where: { id: doctor.id },
      data: { licenseImage: null },
    });
  }

  private removeFile(doctorId: string, filename: string | null) {
    if (!filename) return;
    const filePath = join(process.cwd(), 'uploads', 'doctors', doctorId, filename);
    if (existsSync(filePath)) unlinkSync(filePath);
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
