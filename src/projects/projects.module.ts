import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ProjectMemberGuard } from './project-member.guard.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

/** Projects API and the membership guard shared by every `:projectId` route. */
@Module({
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    // Registered after the AuthGuard (AuthModule is imported first) so `req.user` is set.
    { provide: APP_GUARD, useClass: ProjectMemberGuard },
  ],
})
export class ProjectsModule {}
