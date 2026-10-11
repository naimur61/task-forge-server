import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth.types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ProjectRequest } from './project-access.js';

/**
 * Runs on every route with a `:projectId` param. Non-members and unknown projects both get 404,
 * so an outsider can never learn that a project exists.
 */
@Injectable()
export class ProjectMemberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  /** Looks up the membership and attaches it to the request. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest & ProjectRequest>();
    const projectId = req.params['projectId'];
    if (typeof projectId !== 'string' || !req.user) return true;

    const membership = await this.prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: req.user.id } },
      select: { role: true, project: { select: { name: true, status: true } } },
    });
    if (!membership) throw new NotFoundException('Project not found.');

    req.projectAccess = {
      projectId,
      projectName: membership.project.name,
      projectStatus: membership.project.status,
      role: membership.role,
    };
    return true;
  }
}
