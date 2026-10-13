import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { ActivityService } from '../activity/activity.service.js';
import { ErrorCodes } from '../common/dto/api-response.dto.js';
import { USER_SUMMARY_SELECT } from '../common/dto/user-summary.dto.js';
import { ApiException } from '../common/exceptions/api.exception.js';
import { newId } from '../common/utils/ids.js';
import { ROLE_RANK } from '../common/utils/ranks.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ProjectAccessInfo } from '../projects/project-access.js';
import { can } from '../projects/project-permissions.js';
import type {
  AddMemberDto,
  TransferOwnershipDto,
  UpdateMemberRoleDto,
} from './dto/member-request.dto.js';
import type { MemberResponse } from './dto/member-response.dto.js';

/** Columns of a membership that make up a `MemberResponse`. */
const MEMBER_SELECT = {
  id: true,
  projectId: true,
  role: true,
  joinedAt: true,
  user: { select: USER_SUMMARY_SELECT },
} satisfies Prisma.ProjectMemberSelect;

/** Adds, removes and changes project members. */
@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Lists members: OWNER first, then ADMINs, then MEMBERs, each group by join date. */
  async findAll(projectId: string): Promise<MemberResponse[]> {
    const rows = await this.prisma.projectMember.findMany({
      where: { projectId },
      select: MEMBER_SELECT,
    });
    return rows.sort(
      (a, b) =>
        (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9) ||
        a.joinedAt.getTime() - b.joinedAt.getTime() ||
        a.id.localeCompare(b.id),
    );
  }

  /** Adds a registered user (OWNER may add ADMIN or MEMBER, ADMIN only MEMBER). */
  async add(
    access: ProjectAccessInfo,
    actorId: string,
    dto: AddMemberDto,
  ): Promise<MemberResponse> {
    const role = dto.role ?? 'MEMBER';
    if (!can.addMember(access.role, role)) throw this.denied();

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!user) throw this.fieldError('userId', 'User not found.');
    const existing = await this.prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId: access.projectId, userId: dto.userId },
      },
    });
    if (existing) {
      throw new ApiException(
        409,
        'ALREADY_MEMBER',
        'User is already a member of this project.',
      );
    }

    const member = await this.prisma.$transaction(async (tx) => {
      const created = await tx.projectMember.create({
        data: {
          id: newId('mem'),
          projectId: access.projectId,
          userId: dto.userId,
          role,
        },
        select: MEMBER_SELECT,
      });
      await this.activity.log(
        tx,
        access.projectId,
        actorId,
        'member.added',
        `added ${user.name} as ${role.toLowerCase()}`,
      );
      return created;
    });
    await this.notifications.notify(
      dto.userId,
      actorId,
      'member.added',
      `You were added to ${access.projectName}`,
      `/projects/${access.projectId}/board`,
    );
    return member;
  }

  /** Changes a member's role (OWNER only; the owner's own role is locked). */
  async changeRole(
    access: ProjectAccessInfo,
    actorId: string,
    userId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<MemberResponse> {
    if (!can.changeRole(access.role)) throw this.denied();
    const target = await this.findMember(access.projectId, userId);
    if (!target) throw new NotFoundException('Member not found.');
    if (target.role === 'OWNER') {
      throw new ApiException(
        422,
        'OWNER_ROLE_LOCKED',
        "The owner's role cannot be changed.",
      );
    }
    const member = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.projectMember.update({
        where: { projectId_userId: { projectId: access.projectId, userId } },
        data: { role: dto.role },
        select: MEMBER_SELECT,
      });
      await this.activity.log(
        tx,
        access.projectId,
        actorId,
        'member.role_changed',
        `changed ${target.user.name}'s role to ${dto.role.charAt(0)}${dto.role.slice(1).toLowerCase()}`,
      );
      return updated;
    });
    return member;
  }

  /** Removes a member, or lets the caller leave when `userId` is their own id. */
  async remove(
    access: ProjectAccessInfo,
    actorId: string,
    userId: string,
  ): Promise<void> {
    const leaving = userId === actorId;
    if (!leaving && access.role === 'MEMBER') throw this.denied();
    const target = await this.findMember(access.projectId, userId);
    if (!target) throw new NotFoundException('Member not found.');
    if (target.role === 'OWNER') {
      throw new ApiException(
        422,
        'OWNER_CANNOT_LEAVE',
        'Transfer ownership before leaving the project.',
      );
    }
    if (!leaving && !can.removeMember(access.role, target.role)) {
      throw this.denied();
    }

    await this.prisma.$transaction(async (tx) => {
      // Their tasks stay in the project, just unassigned.
      await tx.task.updateMany({
        where: { projectId: access.projectId, assigneeId: userId },
        data: { assigneeId: null },
      });
      await tx.projectMember.delete({
        where: { projectId_userId: { projectId: access.projectId, userId } },
      });
      await this.activity.log(
        tx,
        access.projectId,
        actorId,
        'member.removed',
        leaving
          ? 'left the project'
          : `removed ${target.user.name} from the project`,
      );
    });
  }

  /** Makes another member the OWNER; the caller becomes ADMIN. */
  async transferOwnership(
    access: ProjectAccessInfo,
    actorId: string,
    dto: TransferOwnershipDto,
  ): Promise<MemberResponse> {
    if (!can.transferOwnership(access.role)) throw this.denied();
    if (dto.userId === actorId) {
      throw this.fieldError('userId', 'You already own this project.');
    }
    const target = await this.findMember(access.projectId, dto.userId);
    if (!target) {
      throw this.fieldError('userId', 'User is not a member of this project.');
    }

    const member = await this.prisma.$transaction(async (tx) => {
      await tx.projectMember.update({
        where: {
          projectId_userId: { projectId: access.projectId, userId: actorId },
        },
        data: { role: 'ADMIN' },
      });
      const promoted = await tx.projectMember.update({
        where: {
          projectId_userId: { projectId: access.projectId, userId: dto.userId },
        },
        data: { role: 'OWNER' },
        select: MEMBER_SELECT,
      });
      await tx.project.update({
        where: { id: access.projectId },
        data: { ownerId: dto.userId },
      });
      await this.activity.log(
        tx,
        access.projectId,
        actorId,
        'project.transferred',
        `transferred ownership to ${target.user.name}`,
      );
      return promoted;
    });
    return member;
  }

  /** Finds one membership with its user. */
  private findMember(projectId: string, userId: string) {
    return this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId } },
      select: MEMBER_SELECT,
    });
  }

  /** The 403 for a role that may not do the action. */
  private denied(): ForbiddenException {
    return new ForbiddenException('You do not have permission to do this.');
  }

  /** A 400 pinned to one body field. */
  private fieldError(field: string, message: string): ApiException {
    return new ApiException(400, ErrorCodes.VALIDATION_ERROR, message, {
      [field]: message,
    });
  }
}
