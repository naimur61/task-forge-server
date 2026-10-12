import { Prisma } from '../../../generated/prisma/client.js';

/** Checks whether the error is a Prisma unique violation (P2002). */
export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

/** Prisma codes that mean the database cannot be reached or the pool is exhausted. */
const DB_UNAVAILABLE_CODES = new Set([
  'P1001',
  'P1002',
  'P1008',
  'P1017',
  'P2024',
]);

/** Connection-level messages from the pg driver / adapter. */
const DB_UNAVAILABLE_PATTERN =
  /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|timeout exceeded when trying to connect|Connection terminated|Can't reach database server|too many clients|Server has closed the connection/i;

/** Checks whether the error means the database is unreachable (retry later), not a bug. */
export function isDbUnavailable(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return DB_UNAVAILABLE_CODES.has(err.code);
  }
  if (err instanceof Error) {
    return (
      DB_UNAVAILABLE_PATTERN.test(err.message) ||
      isDbUnavailable((err as { cause?: unknown }).cause)
    );
  }
  return false;
}

/** Checks whether the error is a Prisma record-not-found (P2025). */
export function isNotFound(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'
  );
}
