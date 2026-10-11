import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { Paginated } from '../common/dto/api-response.dto.js';
import {
  ApiOkEnvelope,
  ApiPaginatedEnvelope,
} from '../common/swagger/api-envelope.decorators.js';
import { DashboardService } from './dashboard.service.js';
import {
  DashboardSummaryResponse,
  MyTaskResponse,
} from './dto/dashboard-response.dto.js';
import { QueryMyTasksDto } from './dto/query-my-tasks.dto.js';

/** Cross-project overview of the signed-in user. */
@ApiTags('Dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Returns project/task totals, status and priority breakdowns, a 14-day trend and recent activity. */
  @Get('summary')
  @ApiOkEnvelope(DashboardSummaryResponse)
  summary(@CurrentUser() user: AuthUser): Promise<DashboardSummaryResponse> {
    return this.dashboard.summary(user.id);
  }

  /** Lists open tasks assigned to me. */
  @Get('my-tasks')
  @ApiPaginatedEnvelope(MyTaskResponse)
  myTasks(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryMyTasksDto,
  ): Promise<Paginated<MyTaskResponse>> {
    return this.dashboard.myTasks(user.id, query);
  }
}
