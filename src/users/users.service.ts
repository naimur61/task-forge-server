import { Injectable } from '@nestjs/common';
import { DELETED_EMAIL_DOMAIN } from '../auth/auth.service.js';
import {
  USER_SUMMARY_SELECT,
  type UserSummaryResponse,
} from '../common/dto/user-summary.dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** Shortest search term that is looked up. */
const MIN_QUERY_LENGTH = 2;
/** Most users a search returns. */
const MAX_RESULTS = 10;

/** Finds registered users to add to a project. */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Searches by name or email (case-insensitive contains). */
  async search(q: string | undefined): Promise<UserSummaryResponse[]> {
    const term = q?.trim() ?? '';
    if (term.length < MIN_QUERY_LENGTH) return [];
    return this.prisma.user.findMany({
      where: {
        // Anonymised (deleted) accounts must not be discoverable.
        email: { not: { endsWith: DELETED_EMAIL_DOMAIN } },
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
        ],
      },
      select: USER_SUMMARY_SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: MAX_RESULTS,
    });
  }
}
