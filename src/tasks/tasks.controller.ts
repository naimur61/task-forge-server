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
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import type { Paginated } from '../common/dto/api-response.dto.js';
import {
  ApiCreatedEnvelope,
  ApiOkEnvelope,
  ApiPaginatedEnvelope,
} from '../common/swagger/api-envelope.decorators.js';
import {
  ProjectAccess,
  type ProjectAccessInfo,
} from '../projects/project-access.js';
import {
  CreateTaskDto,
  MoveTaskDto,
  QueryTasksDto,
  TaskFilterDto,
  UpdateTaskDto,
} from './dto/task-request.dto.js';
import { BoardResponse, TaskResponse } from './dto/task-response.dto.js';
import { TasksService } from './tasks.service.js';

/** Tasks of a project. */
@ApiTags('Tasks')
@ApiBearerAuth()
@Controller('projects/:projectId')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  /** Lists tasks with search, filters, sort and pagination. */
  @Get('tasks')
  @ApiPaginatedEnvelope(TaskResponse)
  findAll(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Query() query: QueryTasksDto,
  ): Promise<Paginated<TaskResponse>> {
    return this.tasks.findAll(projectId, user.id, query);
  }

  /** Returns the kanban board: all matching tasks grouped by status. */
  @Get('board')
  @ApiOkEnvelope(BoardResponse)
  board(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Query() query: TaskFilterDto,
  ): Promise<BoardResponse> {
    return this.tasks.board(projectId, user.id, query);
  }

  /** Creates a task. */
  @Post('tasks')
  @ApiCreatedEnvelope(TaskResponse)
  @ApiUnprocessableEntityResponse({
    description: '`PROJECT_ARCHIVED` or `ASSIGNEE_NOT_MEMBER`.',
  })
  create(
    @CurrentUser() user: AuthUser,
    @ProjectAccess() access: ProjectAccessInfo,
    @Body() dto: CreateTaskDto,
  ): Promise<TaskResponse> {
    return this.tasks.create(access, user.id, dto);
  }

  /** Returns one task. */
  @Get('tasks/:taskId')
  @ApiOkEnvelope(TaskResponse)
  @ApiNotFoundResponse({ description: 'No such task in this project.' })
  findOne(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
  ): Promise<TaskResponse> {
    return this.tasks.findOne(projectId, taskId);
  }

  /** Moves a task to a column and position. */
  @Patch('tasks/:taskId/move')
  @ApiOkEnvelope(TaskResponse)
  @ApiForbiddenResponse({
    description: 'Members may only move tasks they created or are assigned to.',
  })
  move(
    @CurrentUser() user: AuthUser,
    @ProjectAccess() access: ProjectAccessInfo,
    @Param('taskId') taskId: string,
    @Body() dto: MoveTaskDto,
  ): Promise<TaskResponse> {
    return this.tasks.move(access, user.id, taskId, dto);
  }

  /** Updates the fields sent. */
  @Patch('tasks/:taskId')
  @ApiOkEnvelope(TaskResponse)
  @ApiForbiddenResponse({
    description: 'Members may only edit tasks they created or are assigned to.',
  })
  update(
    @CurrentUser() user: AuthUser,
    @ProjectAccess() access: ProjectAccessInfo,
    @Param('taskId') taskId: string,
    @Body() dto: UpdateTaskDto,
  ): Promise<TaskResponse> {
    return this.tasks.update(access, user.id, taskId, dto);
  }

  /** Deletes a task and its comments. */
  @Delete('tasks/:taskId')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiForbiddenResponse({
    description: 'Members may only delete tasks they created.',
  })
  remove(
    @CurrentUser() user: AuthUser,
    @ProjectAccess() access: ProjectAccessInfo,
    @Param('taskId') taskId: string,
  ): Promise<void> {
    return this.tasks.remove(access, user.id, taskId);
  }
}
