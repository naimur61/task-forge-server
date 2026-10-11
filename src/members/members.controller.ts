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
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiTags,
  ApiUnprocessableEntityResponse,
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
import {
  AddMemberDto,
  TransferOwnershipDto,
  UpdateMemberRoleDto,
} from './dto/member-request.dto.js';
import { MemberResponse } from './dto/member-response.dto.js';
import { MembersService } from './members.service.js';

/** Members of a project; the `ProjectMemberGuard` already proved the caller belongs to it. */
@ApiTags('Members')
@ApiBearerAuth()
@Controller('projects/:projectId')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  /** Lists the members (OWNER, ADMINs, MEMBERs). */
  @Get('members')
  @ApiListEnvelope(MemberResponse)
  findAll(@Param('projectId') projectId: string): Promise<MemberResponse[]> {
    return this.members.findAll(projectId);
  }

  /** Adds a registered user to the project (OWNER, ADMIN). */
  @Post('members')
  @ApiCreatedEnvelope(MemberResponse)
  @ApiConflictResponse({ description: '`ALREADY_MEMBER`' })
  @ApiForbiddenResponse({
    description: 'Members cannot add; admins cannot add admins.',
  })
  add(
    @CurrentUser() user: AuthUser,
    @ProjectAccess() access: ProjectAccessInfo,
    @Body() dto: AddMemberDto,
  ): Promise<MemberResponse> {
    return this.members.add(access, user.id, dto);
  }

  /** Changes a member's role (OWNER). */
  @Patch('members/:userId')
  @ApiOkEnvelope(MemberResponse)
  @ApiUnprocessableEntityResponse({ description: '`OWNER_ROLE_LOCKED`' })
  changeRole(
    @CurrentUser() user: AuthUser,
    @ProjectAccess() access: ProjectAccessInfo,
    @Param('userId') userId: string,
    @Body() dto: UpdateMemberRoleDto,
  ): Promise<MemberResponse> {
    return this.members.changeRole(access, user.id, userId, dto);
  }

  /** Removes a member, or leaves the project when `:userId` is the caller. */
  @Delete('members/:userId')
  @HttpCode(204)
  @ApiNoContentResponse()
  @ApiUnprocessableEntityResponse({ description: '`OWNER_CANNOT_LEAVE`' })
  remove(
    @CurrentUser() user: AuthUser,
    @ProjectAccess() access: ProjectAccessInfo,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.members.remove(access, user.id, userId);
  }

  /** Hands the project to another member (OWNER). */
  @Post('transfer-ownership')
  @HttpCode(200)
  @ApiOkEnvelope(MemberResponse)
  transferOwnership(
    @CurrentUser() user: AuthUser,
    @ProjectAccess() access: ProjectAccessInfo,
    @Body() dto: TransferOwnershipDto,
  ): Promise<MemberResponse> {
    return this.members.transferOwnership(access, user.id, dto);
  }
}
