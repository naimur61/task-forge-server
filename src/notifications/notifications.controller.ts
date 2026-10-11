import {
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { Paginated } from '../common/dto/api-response.dto.js';
import { PageQueryDto } from '../common/dto/pagination.dto.js';
import {
  ApiOkEnvelope,
  ApiPaginatedEnvelope,
} from '../common/swagger/api-envelope.decorators.js';
import { NotificationResponse } from './dto/notification-response.dto.js';
import { NotificationsService } from './notifications.service.js';

/** Notifications of the signed-in user. */
@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Lists my notifications (`meta.unread` feeds the bell badge). */
  @Get()
  @ApiPaginatedEnvelope(NotificationResponse)
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: PageQueryDto,
  ): Promise<Paginated<NotificationResponse>> {
    return this.notifications.findAll(user.id, query);
  }

  /** Marks all my notifications as read. */
  @Post('read-all')
  @HttpCode(200)
  markAllRead(@CurrentUser() user: AuthUser): Promise<{ success: true }> {
    return this.notifications.markAllRead(user.id);
  }

  /** Marks one notification as read. */
  @Patch(':id/read')
  @ApiOkEnvelope(NotificationResponse)
  @ApiNotFoundResponse({ description: 'Not one of my notifications.' })
  markRead(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<NotificationResponse> {
    return this.notifications.markRead(user.id, id);
  }
}
