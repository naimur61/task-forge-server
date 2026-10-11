import { Injectable } from '@nestjs/common';
import {
  ACTIVITY_INCLUDE,
  toActivityResponse,
} from '../activity/activity.service.js';
import { paginated, type Paginated } from '../common/dto/api-response.dto.js';
import { clampPage } from '../common/dto/pagination.dto.js';
import { plain } from '../common/utils/plain.js';
import { PRIORITIES, STATUSES } from '../common/utils/ranks.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TASK_INCLUDE, toTaskResponse } from '../tasks/tasks.service.js';
import type {
  DashboardSummaryResponse,
  MyTaskResponse,
} from './dto/dashboard-response.dto.js';
import type { QueryMyTasksDto } from './dto/query-my-tasks.dto.js';

const DAY_MS = 86_400_000;
/** Days shown in `completionTrend`. */
const TREND_DAYS = 14;
/** Entries shown in `recentActivity`. */
const RECENT_ACTIVITY = 8;

/** Formats a date as `YYYY-MM-DD` (UTC). */
const dayKey = (date: Date): string => date.toISOString().slice(0, 10);

/** Dashboard numbers over the projects the user belongs to. */
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** Builds the summary with parallel counts and group-bys (no per-row loops). */
  async summary(userId: string): Promise<DashboardSummaryResponse> {
    const projectIds = await this.projectIdsOf(userId);
    const inProjects = { projectId: { in: projectIds } };
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const trendStart = new Date(today.getTime() - (TREND_DAYS - 1) * DAY_MS);
    const notDone = { status: { not: 'DONE' as const } };

    const [
      projectGroups,
      total,
      completed,
      inProgress,
      overdue,
      highPriority,
      assignedToMe,
      statusGroups,
      priorityGroups,
      completedRows,
      activity,
    ] = await Promise.all([
      this.prisma.project.groupBy({
        by: ['status'],
        where: { id: { in: projectIds } },
        _count: { _all: true },
      }),
      this.prisma.task.count({ where: inProjects }),
      this.prisma.task.count({ where: { ...inProjects, status: 'DONE' } }),
      this.prisma.task.count({
        where: { ...inProjects, status: 'IN_PROGRESS' },
      }),
      this.prisma.task.count({
        where: { ...inProjects, ...notDone, dueDate: { lt: now } },
      }),
      this.prisma.task.count({
        where: {
          ...inProjects,
          ...notDone,
          priority: { in: ['HIGH', 'URGENT'] },
        },
      }),
      this.prisma.task.count({
        where: { ...inProjects, ...notDone, assigneeId: userId },
      }),
      this.prisma.task.groupBy({
        by: ['status'],
        where: inProjects,
        _count: { _all: true },
      }),
      this.prisma.task.groupBy({
        by: ['priority'],
        where: inProjects,
        _count: { _all: true },
      }),
      this.prisma.task.findMany({
        where: { ...inProjects, completedAt: { gte: trendStart } },
        select: { completedAt: true },
      }),
      this.prisma.activity.findMany({
        where: inProjects,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: RECENT_ACTIVITY,
        include: ACTIVITY_INCLUDE,
      }),
    ]);

    const projectsWith = (status: string): number =>
      projectGroups.find((g) => g.status === status)?._count._all ?? 0;
    const active = projectsWith('ACTIVE');
    const archived = projectsWith('ARCHIVED');

    const perDay = new Map<string, number>();
    for (const { completedAt } of completedRows) {
      const key = dayKey(completedAt!);
      perDay.set(key, (perDay.get(key) ?? 0) + 1);
    }

    return {
      projects: { total: active + archived, active, archived },
      tasks: {
        total,
        completed,
        inProgress,
        overdue,
        highPriority,
        assignedToMe,
      },
      byStatus: STATUSES.map((status) => ({
        status,
        count: statusGroups.find((g) => g.status === status)?._count._all ?? 0,
      })),
      byPriority: PRIORITIES.map((priority) => ({
        priority,
        count:
          priorityGroups.find((g) => g.priority === priority)?._count._all ?? 0,
      })),
      completionTrend: Array.from({ length: TREND_DAYS }, (_, i) => {
        const date = dayKey(new Date(trendStart.getTime() + i * DAY_MS));
        return { date, completed: perDay.get(date) ?? 0 };
      }),
      recentActivity: activity.map(toActivityResponse),
    };
  }

  /** Lists open tasks assigned to me, soonest due date first (no due date last). */
  async myTasks(
    userId: string,
    query: QueryMyTasksDto,
  ): Promise<Paginated<MyTaskResponse>> {
    const where = {
      projectId: { in: await this.projectIdsOf(userId) },
      assigneeId: userId,
      status: { not: 'DONE' as const },
      ...(query.overdue && { dueDate: { lt: new Date() } }),
    };
    const total = await this.prisma.task.count({ where });
    const page = clampPage(query.page, query.limit, total);
    const rows = await this.prisma.task.findMany({
      where,
      orderBy: [
        { dueDate: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'asc' },
      ],
      skip: (page - 1) * query.limit,
      take: query.limit,
      include: { ...TASK_INCLUDE, project: { select: { name: true } } },
    });
    return paginated(
      rows.map((row) => ({
        ...plain(toTaskResponse(row)),
        projectName: row.project.name,
      })),
      total,
      page,
      query.limit,
    );
  }

  /** Ids of the projects the user belongs to. */
  private async projectIdsOf(userId: string): Promise<string[]> {
    const rows = await this.prisma.projectMember.findMany({
      where: { userId },
      select: { projectId: true },
    });
    return rows.map((r) => r.projectId);
  }
}
