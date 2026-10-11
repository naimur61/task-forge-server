import { Module } from '@nestjs/common';
import { ActivityModule } from '../activity/activity.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RealtimeModule } from '../realtime/realtime.module.js';

/** Shared infrastructure the feature modules depend on: database, live updates, activity log, notifications. */
@Module({
  imports: [PrismaModule, RealtimeModule, ActivityModule, NotificationsModule],
})
export class PlatformModule {}
