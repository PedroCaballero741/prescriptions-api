import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { resolvePagination } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';

export type SafeUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
  }

  async createWithRoleProfile(input: {
    email: string;
    password: string;
    name: string;
    role: 'patient' | 'doctor';
  }) {
    const email = input.email.toLowerCase();
    const role = input.role === 'doctor' ? Role.doctor : Role.patient;
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          password: input.password,
          name: input.name,
          role,
        },
      });

      if (role === Role.doctor) {
        await tx.doctor.create({
          data: { userId: user.id, specialty: null },
        });
      } else {
        await tx.patient.create({
          data: { userId: user.id, birthDate: null },
        });
      }

      return user;
    });
  }

  async listForAdmin(query: ListUsersQueryDto) {
    const { page, pageSize } = resolvePagination(query);
    const where: Prisma.UserWhereInput = { deletedAt: null };

    if (query.role) {
      where.role = query.role;
    }

    const q = query.query?.trim();
    if (q) {
      where.OR = [
        { email: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
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

  async createManagedUser(input: CreateUserDto): Promise<SafeUser> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.findByEmail(email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(input.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          name: input.name.trim(),
          password: passwordHash,
          role: input.role,
        },
      });

      if (input.role === Role.doctor) {
        await tx.doctor.create({
          data: {
            userId: created.id,
            specialty: input.specialty?.trim() || null,
          },
        });
      } else if (input.role === Role.patient) {
        await tx.patient.create({
          data: {
            userId: created.id,
            birthDate: input.birthDate ? new Date(input.birthDate) : null,
          },
        });
      } else if (input.role === Role.admin) {
        /* no profile row */
      } else {
        throw new BadRequestException('Unsupported role');
      }

      return created;
    });

    return this.toSafeUser(user);
  }

  async softDelete(id: string): Promise<SafeUser> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException('User not found');

    const updated = await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return this.toSafeUser(updated);
  }

  private toSafeUser(user: {
    id: string;
    email: string;
    name: string;
    role: Role;
    createdAt: Date;
  }): SafeUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}
