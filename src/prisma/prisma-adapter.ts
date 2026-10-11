import { PrismaPg } from '@prisma/adapter-pg';

/** Connection settings for the Postgres adapter. */
export interface PrismaAdapterOptions {
  connectionString: string;
  /** Max pool size (default 10). */
  max?: number;
  /** Fail a connection attempt after this many ms (default 5 000). */
  connectionTimeoutMillis?: number;
  /** Close idle connections after this many ms (default 30 000). */
  idleTimeoutMillis?: number;
  /** Verify the server certificate (managed Postgres in production). */
  ssl?: boolean;
}

/** Builds the `PrismaPg` adapter, the only place it is created, with the session pinned to UTC. */
export function createPrismaAdapter(options: PrismaAdapterOptions): PrismaPg {
  return new PrismaPg({
    connectionString: options.connectionString,
    max: options.max ?? 10,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 5_000,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
    ssl: options.ssl ? { rejectUnauthorized: true } : undefined,
    // The adapter shifts `timestamptz` reads by the session zone unless it is UTC.
    options: '-c TimeZone=UTC',
  });
}
