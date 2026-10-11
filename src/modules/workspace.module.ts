import { Module } from '@nestjs/common';
import { CommentsModule } from '../comments/comments.module.js';
import { DashboardModule } from '../dashboard/dashboard.module.js';
import { LabelsModule } from '../labels/labels.module.js';
import { MembersModule } from '../members/members.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { UsersModule } from '../users/users.module.js';

/** Projects, members, tasks and everything attached to them. */
@Module({
  imports: [
    UsersModule,
    ProjectsModule,
    MembersModule,
    TasksModule,
    CommentsModule,
    LabelsModule,
    DashboardModule,
  ],
})
export class WorkspaceModule {}
