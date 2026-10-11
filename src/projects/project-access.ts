import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type {
  MemberRole,
  ProjectStatus,
} from '../../generated/prisma/enums.js';

/** What the `ProjectMemberGuard` learned about the current user and the `:projectId` of the route. */
export class ProjectAccessInfo {
  projectId!: string;
  projectName!: string;
  projectStatus!: ProjectStatus;
  /** Role of the current user in this project. */
  role!: MemberRole;
}

/** Express request after the `ProjectMemberGuard` ran. */
export type ProjectRequest = Request & { projectAccess?: ProjectAccessInfo };

/** Param decorator returning the current user's access to the route's project. */
export const ProjectAccess = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): ProjectAccessInfo =>
    ctx.switchToHttp().getRequest<ProjectRequest>()
      .projectAccess as ProjectAccessInfo,
);
