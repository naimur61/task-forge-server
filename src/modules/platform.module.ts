import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

/** Shared infrastructure the feature modules depend on: database, activity log, notifications. */
@Module({
  imports: [PrismaModule, ActivityModule, NotificationsModule],
})
export class PlatformModule {}
