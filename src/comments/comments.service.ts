import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { USER_SUMMARY_SELECT } from '../common/dto/user-summary.dto.js';
import { newId } from '../common/utils/ids.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ProjectAccessInfo } from '../projects/project-access.js';
import { can } from '../projects/project-permissions.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import type { CommentResponse } from './dto/comment-response.dto.js';

/** Columns of a comment that make up a `CommentResponse`. */
const COMMENT_SELECT = {
  id: true,
  taskId: true,
  body: true,
  createdAt: true,
  updatedAt: true,
  author: { select: USER_SUMMARY_SELECT },
} satisfies Prisma.CommentSelect;

/** Reads, adds, edits and deletes task comments. */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Lists a task's comments, oldest first. */
  async findAll(projectId: string, taskId: string): Promise<CommentResponse[]> {
    await this.findTask(projectId, taskId);
    return this.prisma.comment.findMany({
      where: { taskId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: COMMENT_SELECT,
    });
  }

  /** Adds a comment; any member may comment. */
  async create(
    access: ProjectAccessInfo,
    userId: string,
    taskId: string,
    body: string,
  ): Promise<CommentResponse> {
    const task = await this.findTask(access.projectId, taskId);
    const comment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: { id: newId('cmt'), taskId, authorId: userId, body },
        select: COMMENT_SELECT,
      });
      await this.activity.log(
        tx,
        access.projectId,
        userId,
        'comment.added',
        `commented on "${task.title}"`,
      );
      return created;
    });
    this.realtime.toProject('comment.added', access.projectId, userId, {
      taskId,
    });
    return comment;
  }

  /** Edits a comment; only its author may. */
  async update(
    access: ProjectAccessInfo,
    userId: string,
    taskId: string,
    commentId: string,
    body: string,
  ): Promise<CommentResponse> {
    await this.findTask(access.projectId, taskId);
    const existing = await this.findComment(taskId, commentId);
    if (existing.authorId !== userId) {
      throw new ForbiddenException('Only the author can edit a comment.');
    }
    const updated = await this.prisma.comment.update({
      where: { id: commentId },
      data: { body },
      select: COMMENT_SELECT,
    });
    this.realtime.toProject('comment.updated', access.projectId, userId, {
      taskId,
    });
    return updated;
  }

  /** Deletes a comment (its author, OWNER or ADMIN). */
  async remove(
    access: ProjectAccessInfo,
    userId: string,
    taskId: string,
    commentId: string,
  ): Promise<void> {
    await this.findTask(access.projectId, taskId);
    const existing = await this.findComment(taskId, commentId);
    if (!can.deleteComment(access.role, userId, existing)) {
      throw new ForbiddenException('You do not have permission to do this.');
    }
    await this.prisma.comment.delete({ where: { id: commentId } });
    this.realtime.toProject('comment.deleted', access.projectId, userId, {
      taskId,
    });
  }

  /** Finds a task of this project; a task id from another project is a 404 (IDOR defence). */
  private async findTask(projectId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: { id: true, title: true },
    });
    if (!task) throw new NotFoundException('Task not found.');
    return task;
  }

  /** Finds a comment of this task, or throws 404. */
  private async findComment(taskId: string, commentId: string) {
    const comment = await this.prisma.comment.findFirst({
      where: { id: commentId, taskId },
    });
    if (!comment) throw new NotFoundException('Comment not found.');
    return comment;
  }
}
