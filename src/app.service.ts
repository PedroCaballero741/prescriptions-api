import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth() {
    const start = Date.now();

    let dbStatus: 'ok' | 'error' = 'error';
    let dbLatencyMs: number | null = null;

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - start;
      dbStatus = 'ok';
    } catch {
      dbLatencyMs = null;
    }

    const uptimeSeconds = Math.floor(process.uptime());

    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      version: process.env.npm_package_version ?? '0.0.1',
      environment: process.env.NODE_ENV ?? 'development',
      timestamp: new Date().toISOString(),
      uptime: uptimeSeconds,
      services: {
        api: {
          status: 'ok',
          memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
          nodeVersion: process.version,
        },
        database: {
          status: dbStatus,
          latencyMs: dbLatencyMs,
          provider: 'postgresql',
        },
      },
    };
  }
}
