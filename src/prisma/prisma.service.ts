import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '../../generated/prisma/client.js';
import type { Env } from '../core/env.validation.js';
import { createPrismaAdapter } from './prisma-adapter.js';

/** Prisma client that connects on startup and disconnects on shutdown. */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: createPrismaAdapter({
        connectionString: config.get('DATABASE_URL', { infer: true }),
        max: config.get('DB_POOL_MAX', { infer: true }),
        connectionTimeoutMillis: config.get('DB_CONNECTION_TIMEOUT_MS', {
          infer: true,
        }),
        idleTimeoutMillis: config.get('DB_IDLE_TIMEOUT_MS', { infer: true }),
        ssl: config.get('DB_SSL', { infer: true }),
      }),
    });
  }

  /** Connects to the database. */
  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to database');
  }

  /** Closes the database connection pool. */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Disconnected from database');
  }
}
