import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { paginated, type Paginated } from '../common/dto/api-response.dto.js';
import { clampPage } from '../common/dto/pagination.dto.js';
import { USER_SUMMARY_SELECT } from '../common/dto/user-summary.dto.js';
import { newId } from '../common/utils/ids.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ActivityResponse } from './dto/activity-response.dto.js';
import type { QueryActivityDto } from './dto/query-activity.dto.js';

/** Prisma `include` that yields an `ActivityResponse`. */
export const ACTIVITY_INCLUDE = {
  actor: { select: USER_SUMMARY_SELECT },
  project: { select: { name: true } },
} satisfies Prisma.ActivityInclude;

/** Maps an activity row to its response. */
export function toActivityResponse(
  row: Prisma.ActivityGetPayload<{ include: typeof ACTIVITY_INCLUDE }>,
): ActivityResponse {
  return {
    id: row.id,
    projectId: row.projectId,
    projectName: row.project.name,
    actor: row.actor,
    action: row.action,
    message: row.message,
    createdAt: row.createdAt,
  };
}

/** Writes and reads the per-project activity log. */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Records one change; pass the transaction client so the entry commits with the change itself. */
  async log(
    db: Pick<Prisma.TransactionClient, 'activity'>,
    projectId: string,
    actorId: string,
    action: string,
    message: string,
  ): Promise<void> {
    await db.activity.create({
      data: { id: newId('act'), projectId, actorId, action, message },
    });
  }

  /** Lists a project's activity, newest first. */
  async findAll(
    projectId: string,
    query: QueryActivityDto,
  ): Promise<Paginated<ActivityResponse>> {
    const limit = query.limit;
    const total = await this.prisma.activity.count({ where: { projectId } });
    const page = clampPage(query.page, limit, total);
    const rows = await this.prisma.activity.findMany({
      where: { projectId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * limit,
      take: limit,
      include: ACTIVITY_INCLUDE,
    });
    return paginated(rows.map(toActivityResponse), total, page, limit);
  }
}
