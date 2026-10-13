import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { TaskStatus } from '../../generated/prisma/enums.js';
import { ActivityService } from '../activity/activity.service.js';
import {
  ErrorCodes,
  paginated,
  type Paginated,
} from '../common/dto/api-response.dto.js';
import { clampPage } from '../common/dto/pagination.dto.js';
import { USER_SUMMARY_SELECT } from '../common/dto/user-summary.dto.js';
import { ApiException } from '../common/exceptions/api.exception.js';
import { newId } from '../common/utils/ids.js';
import { parseSortField } from '../common/utils/parse-sort.js';
import { STATUSES, STATUS_LABEL } from '../common/utils/ranks.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ProjectAccessInfo } from '../projects/project-access.js';
import { can } from '../projects/project-permissions.js';
import {
  type CreateTaskDto,
  type MoveTaskDto,
  type QueryTasksDto,
  TASK_SORT_FIELDS,
  type TaskFilterDto,
  type UpdateTaskDto,
} from './dto/task-request.dto.js';
import type { BoardResponse, TaskResponse } from './dto/task-response.dto.js';
import { POSITION_STEP, positionBetween } from './position.js';
import { buildTaskWhere } from './task-query.js';

/** Prisma `include` that yields a `TaskResponse`. */
export const TASK_INCLUDE = {
  assignee: { select: USER_SUMMARY_SELECT },
  creator: { select: USER_SUMMARY_SELECT },
  labels: { include: { label: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.TaskInclude;

/** Maps a task row to its response. */
export function toTaskResponse(
  row: Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>,
): TaskResponse {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    position: row.position,
    dueDate: row.dueDate,
    assignee: row.assignee,
    creator: row.creator,
    labels: row.labels
      .map((l) => l.label)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((l) => ({
        id: l.id,
        projectId: l.projectId,
        name: l.name,
        color: l.color,
      })),
    commentCount: row._count.comments,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Queries and edits tasks. */
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Returns a filtered, sorted, paginated list of tasks. */
  async findAll(
    projectId: string,
    userId: string,
    query: QueryTasksDto,
  ): Promise<Paginated<TaskResponse>> {
    const where = buildTaskWhere(projectId, userId, query);
    const sortBy = parseSortField(query.sortBy, TASK_SORT_FIELDS, 'createdAt');
    const order = query.order ?? 'desc';
    const total = await this.prisma.task.count({ where });
    const page = clampPage(query.page, query.limit, total);
    const skip = (page - 1) * query.limit;

    const rows =
      sortBy === 'title'
        ? await this.findPageByTitle(where, order, skip, query.limit)
        : await this.prisma.task.findMany({
            where,
            // `priority` is declared LOW < MEDIUM < HIGH < URGENT, so database order is rank order.
            orderBy: [
              sortBy === 'dueDate'
                ? { dueDate: { sort: order, nulls: 'last' } }
                : { [sortBy]: order },
              { createdAt: 'desc' },
              { id: 'asc' },
            ],
            skip,
            take: query.limit,
            include: TASK_INCLUDE,
          });
    return paginated(rows.map(toTaskResponse), total, page, query.limit);
  }

  /** Returns every matching task grouped by status, each column ordered by `position`. */
  async board(
    projectId: string,
    userId: string,
    filter: TaskFilterDto,
  ): Promise<BoardResponse> {
    const rows = await this.prisma.task.findMany({
      where: buildTaskWhere(projectId, userId, filter),
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      include: TASK_INCLUDE,
    });
    const board = Object.fromEntries(
      STATUSES.map((status) => [status, [] as TaskResponse[]]),
    ) as unknown as BoardResponse;
    for (const row of rows) board[row.status].push(toTaskResponse(row));
    return board;
  }

  /** Returns one task of the project, or throws 404. */
  async findOne(projectId: string, taskId: string): Promise<TaskResponse> {
    return toTaskResponse(await this.findInProject(projectId, taskId));
  }

  /** Creates a task at the end of its column (any member; archived projects are read-only). */
  async create(
    access: ProjectAccessInfo,
    userId: string,
    dto: CreateTaskDto,
  ): Promise<TaskResponse> {
    this.assertWritable(access);
    await this.assertAssignee(access.projectId, dto.assigneeId);
    await this.assertLabels(access.projectId, dto.labelIds);
    const status = dto.status ?? 'TODO';

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          id: newId('tsk'),
          projectId: access.projectId,
          title: dto.title,
          description: dto.description?.trim() || null,
          status,
          priority: dto.priority ?? 'MEDIUM',
          position: await this.endPosition(tx, access.projectId, status),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          assigneeId: dto.assigneeId ?? null,
          creatorId: userId,
          completedAt: status === 'DONE' ? new Date() : null,
          labels: {
            create: (dto.labelIds ?? []).map((labelId) => ({ labelId })),
          },
        },
        include: TASK_INCLUDE,
      });
      await this.activity.log(
        tx,
        access.projectId,
        userId,
        'task.created',
        `created "${created.title}"`,
      );
      return created;
    });
    await this.notifyAssigned(access, userId, task);
    return toTaskResponse(task);
  }

  /** Updates a task (OWNER/ADMIN any task, MEMBER only tasks they created or are assigned to). */
  async update(
    access: ProjectAccessInfo,
    userId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<TaskResponse> {
    const existing = await this.findInProject(access.projectId, taskId);
    this.assertWritable(access);
    if (!can.editTask(access.role, userId, existing)) throw this.denied();
    if (dto.assigneeId !== undefined) {
      await this.assertAssignee(access.projectId, dto.assigneeId);
    }
    await this.assertLabels(access.projectId, dto.labelIds);

    const statusChanged =
      dto.status !== undefined && dto.status !== existing.status;
    const assigneeChanged =
      dto.assigneeId !== undefined && dto.assigneeId !== existing.assigneeId;

    const task = await this.prisma.$transaction(async (tx) => {
      if (dto.labelIds) {
        await tx.taskLabel.deleteMany({ where: { taskId } });
        await tx.taskLabel.createMany({
          data: dto.labelIds.map((labelId) => ({ taskId, labelId })),
        });
      }
      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          ...(dto.title !== undefined && { title: dto.title }),
          ...(dto.description !== undefined && {
            description: dto.description?.trim() || null,
          }),
          ...(dto.priority !== undefined && { priority: dto.priority }),
          ...(dto.dueDate !== undefined && {
            dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          }),
          ...(dto.assigneeId !== undefined && { assigneeId: dto.assigneeId }),
          // A status change puts the task at the end of its new column.
          ...(statusChanged && {
            status: dto.status,
            position: await this.endPosition(tx, access.projectId, dto.status!),
            completedAt: dto.status === 'DONE' ? new Date() : null,
          }),
        },
        include: TASK_INCLUDE,
      });
      await this.activity.log(
        tx,
        access.projectId,
        userId,
        statusChanged ? 'task.moved' : 'task.updated',
        statusChanged
          ? `moved "${updated.title}" to ${STATUS_LABEL[updated.status]}`
          : `updated "${updated.title}"`,
      );
      return updated;
    });
    if (assigneeChanged) await this.notifyAssigned(access, userId, task);
    return toTaskResponse(task);
  }

  /** Moves a task to a column and position (drag and drop). Same permission rules as `update`. */
  async move(
    access: ProjectAccessInfo,
    userId: string,
    taskId: string,
    dto: MoveTaskDto,
  ): Promise<TaskResponse> {
    const existing = await this.findInProject(access.projectId, taskId);
    this.assertWritable(access);
    if (!can.editTask(access.role, userId, existing)) throw this.denied();

    const task = await this.prisma.$transaction(async (tx) => {
      const column = await tx.task.findMany({
        where: {
          projectId: access.projectId,
          status: dto.status,
          id: { not: taskId },
        },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        select: { id: true, position: true },
      });
      const afterPosition = this.afterPosition(column, dto.afterId);
      let position = positionBetween(
        column.map((c) => c.position),
        afterPosition,
      );
      if (position === null) {
        // The gap is used up: renumber the column evenly, then place the task.
        for (const [index, c] of column.entries()) {
          c.position = (index + 1) * POSITION_STEP;
          await tx.task.update({
            where: { id: c.id },
            data: { position: c.position },
          });
        }
        position = positionBetween(
          column.map((c) => c.position),
          this.afterPosition(column, dto.afterId),
        )!;
      }

      const statusChanged = dto.status !== existing.status;
      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          status: dto.status,
          position,
          ...(statusChanged && {
            completedAt: dto.status === 'DONE' ? new Date() : null,
          }),
        },
        include: TASK_INCLUDE,
      });
      if (statusChanged) {
        await this.activity.log(
          tx,
          access.projectId,
          userId,
          'task.moved',
          `moved "${updated.title}" to ${STATUS_LABEL[updated.status]}`,
        );
      }
      return updated;
    });
    return toTaskResponse(task);
  }

  /** Deletes a task and its comments (OWNER/ADMIN any task, MEMBER only tasks they created). */
  async remove(
    access: ProjectAccessInfo,
    userId: string,
    taskId: string,
  ): Promise<void> {
    const existing = await this.findInProject(access.projectId, taskId);
    if (!can.deleteTask(access.role, userId, existing)) throw this.denied();
    await this.prisma.$transaction(async (tx) => {
      await tx.task.delete({ where: { id: taskId } });
      await this.activity.log(
        tx,
        access.projectId,
        userId,
        'task.deleted',
        `deleted "${existing.title}"`,
      );
    });
  }

  /** Case-insensitive title order is not expressible in Prisma, so sort the ids in memory and load one page. */
  private async findPageByTitle(
    where: Prisma.TaskWhereInput,
    order: 'asc' | 'desc',
    skip: number,
    take: number,
  ) {
    const all = await this.prisma.task.findMany({
      where,
      select: { id: true, title: true },
    });
    const sign = order === 'asc' ? 1 : -1;
    all.sort(
      (a, b) =>
        a.title.toLowerCase().localeCompare(b.title.toLowerCase()) * sign ||
        a.id.localeCompare(b.id),
    );
    const ids = all.slice(skip, skip + take).map((t) => t.id);
    const rows = await this.prisma.task.findMany({
      where: { id: { in: ids } },
      include: TASK_INCLUDE,
    });
    return rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  }

  /** Finds a task of this project; a task id from another project is a 404 (IDOR defence). */
  private async findInProject(projectId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId },
      include: TASK_INCLUDE,
    });
    if (!task) throw new NotFoundException('Task not found.');
    return task;
  }

  /** Position of the task a drop lands after (`null` = top of the column), or 400 if it is not in the column. */
  private afterPosition(
    column: { id: string; position: number }[],
    afterId: string | null | undefined,
  ): number | null {
    if (!afterId) return null;
    const after = column.find((c) => c.id === afterId);
    if (!after) {
      throw new ApiException(
        400,
        ErrorCodes.VALIDATION_ERROR,
        'afterId is not a task in the target column.',
        { afterId: 'Not a task in the target column.' },
      );
    }
    return after.position;
  }

  /** 422 `PROJECT_ARCHIVED` when the project is read-only. */
  private assertWritable(access: ProjectAccessInfo): void {
    if (access.projectStatus === 'ARCHIVED') {
      throw new ApiException(
        422,
        'PROJECT_ARCHIVED',
        'Archived projects are read-only.',
      );
    }
  }

  /** 422 `ASSIGNEE_NOT_MEMBER` unless the user belongs to the project. */
  private async assertAssignee(
    projectId: string,
    assigneeId: string | null | undefined,
  ): Promise<void> {
    if (!assigneeId) return;
    const member = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: assigneeId } },
    });
    if (!member) {
      throw new ApiException(
        422,
        'ASSIGNEE_NOT_MEMBER',
        'Assignee is not a project member.',
      );
    }
  }

  /** 400 unless every label id belongs to the project. */
  private async assertLabels(
    projectId: string,
    labelIds: string[] | undefined,
  ): Promise<void> {
    if (!labelIds?.length) return;
    const found = await this.prisma.label.count({
      where: { projectId, id: { in: labelIds } },
    });
    if (found !== labelIds.length) {
      throw new ApiException(
        400,
        ErrorCodes.VALIDATION_ERROR,
        'One or more labels do not exist.',
        { labelIds: 'One or more labels do not exist.' },
      );
    }
  }

  /** Position after the last task of a column. */
  private async endPosition(
    tx: Prisma.TransactionClient,
    projectId: string,
    status: TaskStatus,
  ): Promise<number> {
    const max = await tx.task.aggregate({
      where: { projectId, status },
      _max: { position: true },
    });
    return (max._max.position ?? 0) + POSITION_STEP;
  }

  /** Notifies a new assignee (unless they assigned themselves). */
  private async notifyAssigned(
    access: ProjectAccessInfo,
    actorId: string,
    task: { id: string; title: string; assigneeId: string | null },
  ): Promise<void> {
    if (!task.assigneeId || task.assigneeId === actorId) return;
    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { name: true },
    });
    await this.notifications.notify(
      task.assigneeId,
      actorId,
      'task.assigned',
      `${actor?.name ?? 'Someone'} assigned you "${task.title}"`,
      `/projects/${access.projectId}/board?task=${task.id}`,
    );
  }

  /** The 403 for a role that may not do the action. */
  private denied(): ForbiddenException {
    return new ForbiddenException('You do not have permission to do this.');
  }
}
