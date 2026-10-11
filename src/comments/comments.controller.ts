import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  ApiCreatedEnvelope,
  ApiListEnvelope,
  ApiOkEnvelope,
} from '../common/swagger/api-envelope.decorators.js';
import {
  ProjectAccess,
  type ProjectAccessInfo,
} from '../projects/project-access.js';
import { CommentsService } from './comments.service.js';
import { CommentBodyDto } from './dto/comment-request.dto.js';
import { CommentResponse } from './dto/comment-response.dto.js';

/** Comments on a task. */
@ApiTags('Comments')
@ApiBearerAuth()
@Controller('projects/:projectId/tasks/:taskId/comments')
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  /** Lists comments, oldest first. */
  @Get()
  @ApiListEnvelope(CommentResponse)
  findAll(
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
  ): Promise<CommentResponse[]> {
    return this.comments.findAll(projectId, taskId);
  }

  /** Adds a comment. */
  @Post()
  @ApiCreatedEnvelope(CommentResponse)
  create(
    @CurrentUser() user: AuthUser,
    @ProjectAccess() access: ProjectAccessInfo,
    @Param('taskId') taskId: string,
    @Body() dto: CommentBodyDto,
  ): Promise<CommentResponse> {
    return this.comments.create(access, user.id, taskId, dto.body);
  }

  /** Edits a comment (author only). */
  @Patch(':commentId')
  @ApiOkEnvelope(CommentResponse)
  @ApiForbiddenResponse({ description: 'Only the author can edit.' })
  update(
    @CurrentUser() user: AuthUser,
    @ProjectAccess() access: ProjectAccessInfo,
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
    @Body() dto: CommentBodyDto,
  ): Promise<CommentResponse> {
    return this.comments.update(access, user.id, taskId, commentId, dto.body);
  }

  /** Deletes a comment (author, OWNER or ADMIN). */
  @Delete(':commentId')
  @HttpCode(204)
  @ApiNoContentResponse()
  remove(
    @CurrentUser() user: AuthUser,
    @ProjectAccess() access: ProjectAccessInfo,
    @Param('taskId') taskId: string,
    @Param('commentId') commentId: string,
  ): Promise<void> {
    return this.comments.remove(access, user.id, taskId, commentId);
  }
}
