import { Prisma } from '../../../generated/prisma/client.js';

/** Checks whether the error is a Prisma unique violation (P2002). */
export function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
  );
}

/** Checks whether the error is a Prisma record-not-found (P2025). */
export function isNotFound(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025'
  );
}
