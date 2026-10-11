import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type {
  MemberRole,
  ProjectStatus,
} from '../../generated/prisma/enums.js';
import { ActivityService } from '../activity/activity.service.js';
import { paginated, type Paginated } from '../common/dto/api-response.dto.js';
import { clampPage } from '../common/dto/pagination.dto.js';
import { USER_SUMMARY_SELECT } from '../common/dto/user-summary.dto.js';
import { newId } from '../common/utils/ids.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import type { ProjectAccessInfo } from './project-access.js';
import { can } from './project-permissions.js';
import type {
  CreateProjectDto,
  QueryProjectsDto,
  UpdateProjectDto,
} from './dto/project-request.dto.js';
import type { ProjectResponse } from './dto/project-response.dto.js';

/** Queries and edits projects. */
@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Returns the projects the user is a member of, newest activity first. */
  async findAll(
    userId: string,
    query: QueryProjectsDto,
  ): Promise<Paginated<ProjectResponse>> {
    const where: Prisma.ProjectWhereInput = {
      members: { some: { userId } },
      ...(query.status && { status: query.status }),
      ...(query.search && {
        name: { contains: query.search, mode: 'insensitive' },
      }),
    };
    const total = await this.prisma.project.count({ where });
    const page = clampPage(query.page, query.limit, total);
    const rows = await this.prisma.project.findMany({
      where,
      // The `id` tiebreaker keeps pagination stable when timestamps tie.
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * query.limit,
      take: query.limit,
    });
    const memberships = await this.prisma.projectMember.findMany({
      where: { userId, projectId: { in: rows.map((r) => r.id) } },
      select: { projectId: true, role: true },
    });
    const roles = new Map(memberships.map((m) => [m.projectId, m.role]));
    return paginated(
      await this.withCounters(rows, roles),
      total,
      page,
      query.limit,
    );
  }

  /** Returns one project; the guard already proved membership. */
  async findOne(access: ProjectAccessInfo): Promise<ProjectResponse> {
    const row = await this.prisma.project.findUnique({
      where: { id: access.projectId },
    });
    if (!row) throw new NotFoundException('Project not found.');
    return this.single(row, access.role);
  }

  /** Creates a project and makes the creator its OWNER. */
  async create(
    userId: string,
    dto: CreateProjectDto,
  ): Promise<ProjectResponse> {
    const id = newId('prj');
    const row = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          id,
          name: dto.name,
          description: dto.description?.trim() || null,
          ownerId: userId,
          members: { create: { id: newId('mem'), userId, role: 'OWNER' } },
        },
      });
      await this.activity.log(
        tx,
        id,
        userId,
        'project.created',
        `created project "${project.name}"`,
      );
      return project;
    });
    this.realtime.joinProject(userId, id);
    this.realtime.toUser('project.created', userId, userId, { projectId: id });
    return this.single(row, 'OWNER');
  }

  /** Updates name and description (OWNER, ADMIN). */
  async update(
    access: ProjectAccessInfo,
    userId: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectResponse> {
    if (!can.updateProject(access.role)) throw this.denied();
    const row = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id: access.projectId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && {
            description: dto.description?.trim() || null,
          }),
        },
      });
      await this.activity.log(
        tx,
        access.projectId,
        userId,
        'project.updated',
        `updated project "${project.name}"`,
      );
      return project;
    });
    this.realtime.toProject('project.updated', access.projectId, userId);
    return this.single(row, access.role);
  }

  /** Deletes the project with everything in it (OWNER). */
  async remove(access: ProjectAccessInfo, userId: string): Promise<void> {
    if (!can.deleteProject(access.role)) throw this.denied();
    await this.prisma.project.delete({ where: { id: access.projectId } });
    this.realtime.toProject('project.deleted', access.projectId, userId, {
      message: `deleted project "${access.projectName}"`,
    });
    this.realtime.closeProjectRoom(access.projectId);
  }

  /** Archives the project, making its tasks read-only (OWNER). */
  archive(access: ProjectAccessInfo, userId: string): Promise<ProjectResponse> {
    return this.setStatus(access, userId, 'ARCHIVED');
  }

  /** Restores an archived project (OWNER). */
  restore(access: ProjectAccessInfo, userId: string): Promise<ProjectResponse> {
    return this.setStatus(access, userId, 'ACTIVE');
  }

  /** Switches the project status and logs it. */
  private async setStatus(
    access: ProjectAccessInfo,
    userId: string,
    status: ProjectStatus,
  ): Promise<ProjectResponse> {
    if (!can.archiveProject(access.role)) throw this.denied();
    const verb = status === 'ARCHIVED' ? 'archived' : 'restored';
    const row = await this.prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id: access.projectId },
        data: { status },
      });
      await this.activity.log(
        tx,
        access.projectId,
        userId,
        `project.${verb}`,
        `${verb} project "${project.name}"`,
      );
      return project;
    });
    this.realtime.toProject('project.updated', access.projectId, userId);
    return this.single(row, access.role);
  }

  /** Adds counters to one project row. */
  private async single(
    row: ProjectRow,
    role: MemberRole,
  ): Promise<ProjectResponse> {
    const [dto] = await this.withCounters([row], new Map([[row.id, role]]));
    return dto!;
  }

  /** Adds member/task counters and the member preview to project rows, using one query per metric. */
  private async withCounters(
    rows: ProjectRow[],
    roles: Map<string, MemberRole>,
  ): Promise<ProjectResponse[]> {
    if (!rows.length) return [];
    const ids = rows.map((r) => r.id);
    const [memberCounts, previews, taskCounts, doneCounts, overdueCounts] =
      await Promise.all([
        this.prisma.projectMember.groupBy({
          by: ['projectId'],
          where: { projectId: { in: ids } },
          _count: { _all: true },
        }),
        this.prisma.projectMember.findMany({
          where: { projectId: { in: ids } },
          orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
          select: { projectId: true, user: { select: USER_SUMMARY_SELECT } },
        }),
        this.prisma.task.groupBy({
          by: ['projectId'],
          where: { projectId: { in: ids } },
          _count: { _all: true },
        }),
        this.prisma.task.groupBy({
          by: ['projectId'],
          where: { projectId: { in: ids }, status: 'DONE' },
          _count: { _all: true },
        }),
        this.prisma.task.groupBy({
          by: ['projectId'],
          where: {
            projectId: { in: ids },
            status: { not: 'DONE' },
            dueDate: { lt: new Date() },
          },
          _count: { _all: true },
        }),
      ]);

    const members = countsByProject(memberCounts);
    const tasks = countsByProject(taskCounts);
    const done = countsByProject(doneCounts);
    const overdue = countsByProject(overdueCounts);
    const previewOf = new Map<string, ProjectResponse['membersPreview']>();
    for (const p of previews) {
      const list = previewOf.get(p.projectId) ?? [];
      if (list.length < PREVIEW_SIZE) list.push(p.user);
      previewOf.set(p.projectId, list);
    }

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      status: r.status,
      ownerId: r.ownerId,
      myRole: roles.get(r.id) ?? 'MEMBER',
      memberCount: members.get(r.id) ?? 0,
      membersPreview: previewOf.get(r.id) ?? [],
      taskCount: tasks.get(r.id) ?? 0,
      doneCount: done.get(r.id) ?? 0,
      overdueCount: overdue.get(r.id) ?? 0,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /** The 403 for a role that may not do the action. */
  private denied(): ForbiddenException {
    return new ForbiddenException('You do not have permission to do this.');
  }
}

/** Number of members shown in `membersPreview`. */
const PREVIEW_SIZE = 4;

/** Project columns the counters are added to. */
interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Turns Prisma `groupBy` rows into a `projectId → count` map. */
function countsByProject(
  groups: { projectId: string; _count: { _all: number } }[],
): Map<string, number> {
  return new Map(groups.map((g) => [g.projectId, g._count._all]));
}
