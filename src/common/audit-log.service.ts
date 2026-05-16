import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  log(entry: {
    action: string;
    entity: string;
    entityId?: string;
    actorId?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.auditLog.create({
      data: {
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        actorId: entry.actorId ?? null,
        metadata: entry.metadata ? (entry.metadata as object) : undefined,
      },
    });
  }
}
