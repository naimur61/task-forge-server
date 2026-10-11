import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiConflictResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  ApiCreatedEnvelope,
  ApiListEnvelope,
} from '../common/swagger/api-envelope.decorators.js';
import {
  ProjectAccess,
  type ProjectAccessInfo,
} from '../projects/project-access.js';
import { CreateLabelDto } from './dto/label-request.dto.js';
import { LabelResponse } from './dto/label-response.dto.js';
import { LabelsService } from './labels.service.js';

/** Labels of a project. */
@ApiTags('Labels')
@ApiBearerAuth()
@Controller('projects/:projectId/labels')
export class LabelsController {
  constructor(private readonly labels: LabelsService) {}

  /** Lists the project's labels. */
  @Get()
  @ApiListEnvelope(LabelResponse)
  findAll(@Param('projectId') projectId: string): Promise<LabelResponse[]> {
    return this.labels.findAll(projectId);
  }

  /** Creates a label (OWNER, ADMIN). */
  @Post()
  @ApiCreatedEnvelope(LabelResponse)
  @ApiConflictResponse({ description: '`LABEL_EXISTS`' })
  create(
    @CurrentUser() user: AuthUser,
    @ProjectAccess() access: ProjectAccessInfo,
    @Body() dto: CreateLabelDto,
  ): Promise<LabelResponse> {
    return this.labels.create(access, user.id, dto);
  }
}
