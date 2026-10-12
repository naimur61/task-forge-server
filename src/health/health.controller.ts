import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthIndicatorService } from '@nestjs/terminus';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator.js';
import { SkipThrottle } from '../common/throttle/throttle.decorator.js';
import { SkipEnvelope } from '../common/decorators/skip-envelope.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Overall service status. */
export type HealthState = 'operational' | 'degraded' | 'down';

/** Body of `GET /health`. */
export interface HealthResponse {
  status: HealthState;
  /** Database round-trip in milliseconds. */
  latency: number;
  checkedAt: string;
}

/** Body of `GET /health/ready`. */
export interface ReadinessResponse extends HealthResponse {
  checks: { database: 'up' | 'down' };
}

/** A probe slower than this is reported as `degraded`. */
const DEGRADED_MS = 1_000;
/** A probe slower than this is abandoned and reported as `down`. */
const TIMEOUT_MS = 2_000;

/** Public health probes: `/health` and `/health/ready`, answering 503 when down. */
@ApiTags('Health')
@Public()
@SkipEnvelope()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly indicators: HealthIndicatorService,
  ) {}

  /** Returns the health status. */
  @Get()
  async check(
    @Res({ passthrough: true }) res: Response,
  ): Promise<HealthResponse> {
    const { health } = await this.probe(res);
    return health;
  }

  /** Returns the health status plus the individual checks. */
  @Get('ready')
  async ready(
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReadinessResponse> {
    const { health, database } = await this.probe(res);
    return { ...health, checks: { database } };
  }

  /** Probes the database, derives the status and sets 503 when down. */
  private async probe(
    res: Response,
  ): Promise<{ health: HealthResponse; database: 'up' | 'down' }> {
    const started = performance.now();
    const database = await this.pingDatabase();
    const latency = Math.round(performance.now() - started);

    const status: HealthState =
      database === 'down'
        ? 'down'
        : latency >= DEGRADED_MS
          ? 'degraded'
          : 'operational';
    if (status === 'down') res.status(HttpStatus.SERVICE_UNAVAILABLE);

    return {
      health: { status, latency, checkedAt: new Date().toISOString() },
      database,
    };
  }

  /** Runs `SELECT 1` plus one read on a main table (the real data path) with a timeout. */
  private async pingDatabase(): Promise<'up' | 'down'> {
    const result = await this.indicators
      .check('database')
      .attempt(async () => {
        await this.prisma.$queryRaw`SELECT 1`;
        await this.prisma.project.findFirst({ select: { id: true } });
      })
      .withTimeout(TIMEOUT_MS);
    return result.database.status === 'up' ? 'up' : 'down';
  }
}
