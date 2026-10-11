import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ActivityService } from '../activity/activity.service.js';
import { ActivityResponse } from '../activity/dto/activity-response.dto.js';
import { QueryActivityDto } from '../activity/dto/query-activity.dto.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { CreatedAt } from '../common/decorators/location.decorator.js';
import type { Paginated } from '../common/dto/api-response.dto.js';
import {
  ApiCreatedEnvelope,
  ApiOkEnvelope,
  ApiPaginatedEnvelope,
} from '../common/swagger/api-envelope.decorators.js';
import {
  CreateProjectDto,
  QueryProjectsDto,
  UpdateProjectDto,
} from './dto/project-request.dto.js';
import { ProjectResponse } from './dto/project-response.dto.js';
import { ProjectAccess, type ProjectAccessInfo } from './project-access.js';
import { ProjectsService } from './projects.service.js';

/** Projects of the signed-in user. Routes with `:projectId` are guarded by `ProjectMemberGuard` (404 for outsiders). */
@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    private readonly activity: ActivityService,
  ) {}

  /** Lists my projects. */
  @Get()
  @ApiPaginatedEnvelope(ProjectResponse)
  findAll(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryProjectsDto,
  ): Promise<Paginated<ProjectResponse>> {
    return this.projects.findAll(user.id, query);
  }

  /** Creates a project; the creator becomes its OWNER. */
  @Post()
  @CreatedAt('/api/v1/projects/:id')
  @ApiCreatedEnvelope(ProjectResponse)
  create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProjectDto,
  ): Promise<ProjectResponse> {
    return this.projects.create(user.id, dto);
  }

  /** Returns one project. */
  @Get(':projectId')
  @ApiOkEnvelope(ProjectResponse)
  @ApiNotFoundResponse({ description: 'Unknown project, or not a member.' })
  findOne(
    @ProjectAccess() access: ProjectAccessInfo,
  ): Promise<ProjectResponse> {
    return this.projects.findOne(access);
  }

  /** Updates name and description (OWNER, ADMIN). */
  @Patch(':projectId')
  @ApiOkEnvelope(ProjectResponse)
  @ApiForbiddenResponse({ description: 'Plain members cannot edit a project.' })
  update(
    @CurrentUser() user: AuthUser,
    @ProjectAccess() access: ProjectAccessInfo,
    @Body() dto: UpdateProjectDto,
  ): Promise<ProjectResponse> {
    return this.projects.update(access, user.id, dto);
  }

  /** Deletes the project and everything in it (OWNER). */
  @Delete(':projectId')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiForbiddenResponse({ description: 'Only the owner can delete.' })
  remove(
    @CurrentUser() user: AuthUser,
    @ProjectAccess() access: ProjectAccessInfo,
  ): Promise<void> {
    return this.projects.remove(access, user.id);
  }

  /** Archives the project (OWNER). */
  @Post(':projectId/archive')
  @HttpCode(200)
  @ApiOkEnvelope(ProjectResponse)
  archive(
    @CurrentUser() user: AuthUser,
    @ProjectAccess() access: ProjectAccessInfo,
  ): Promise<ProjectResponse> {
    return this.projects.archive(access, user.id);
  }

  /** Restores an archived project (OWNER). */
  @Post(':projectId/restore')
  @HttpCode(200)
  @ApiOkEnvelope(ProjectResponse)
  restore(
    @CurrentUser() user: AuthUser,
    @ProjectAccess() access: ProjectAccessInfo,
  ): Promise<ProjectResponse> {
    return this.projects.restore(access, user.id);
  }

  /** Lists the project's activity, newest first. */
  @Get(':projectId/activity')
  @ApiPaginatedEnvelope(ActivityResponse)
  activityFeed(
    @Param('projectId') projectId: string,
    @Query() query: QueryActivityDto,
  ): Promise<Paginated<ActivityResponse>> {
    return this.activity.findAll(projectId, query);
  }
}
