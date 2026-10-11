import { Injectable, NotFoundException } from '@nestjs/common';
import { paginated, type Paginated } from '../common/dto/api-response.dto.js';
import { clampPage, type PageQueryDto } from '../common/dto/pagination.dto.js';
import { newId } from '../common/utils/ids.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import type { NotificationResponse } from './dto/notification-response.dto.js';

/** Creates and reads the signed-in user's notifications. */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
  ) {}

  /** Stores a notification and pushes it live to the recipient. */
  async notify(
    userId: string,
    actorId: string,
    type: string,
    message: string,
    link: string | null,
  ): Promise<void> {
    await this.prisma.notification.create({
      data: { id: newId('ntf'), userId, type, message, link },
    });
    this.realtime.toUser('notification.created', userId, actorId, { message });
  }

  /** Lists my notifications, newest first; `meta.unread` counts all unread, not just this page. */
  async findAll(
    userId: string,
    query: PageQueryDto,
  ): Promise<Paginated<NotificationResponse>> {
    const [total, unread] = await Promise.all([
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    const page = clampPage(query.page, query.limit, total);
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * query.limit,
      take: query.limit,
    });
    return paginated(rows, total, page, query.limit, { unread });
  }

  /** Marks one of my notifications as read; 404 if it is not mine. */
  async markRead(userId: string, id: string): Promise<NotificationResponse> {
    const row = await this.prisma.notification.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('Notification not found.');
    if (row.readAt) return row;
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
    });
  }

  /** Marks all of my notifications as read. */
  async markAllRead(userId: string): Promise<{ success: true }> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true };
  }
}
