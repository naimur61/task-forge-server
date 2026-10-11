import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const ROLE_MESSAGE = 'Role must be ADMIN or MEMBER.';

/** Body of `POST /projects/:projectId/members`. */
export class AddMemberDto {
  @IsString({ message: 'userId is required.' })
  @MinLength(1, { message: 'userId is required.' })
  userId!: string;

  /** Defaults to `MEMBER`; `OWNER` is not assignable here. */
  @IsOptional()
  @IsIn(['ADMIN', 'MEMBER'], { message: ROLE_MESSAGE })
  role?: 'ADMIN' | 'MEMBER';
}

/** Body of `PATCH /projects/:projectId/members/:userId`. */
export class UpdateMemberRoleDto {
  @IsIn(['ADMIN', 'MEMBER'], { message: ROLE_MESSAGE })
  role!: 'ADMIN' | 'MEMBER';
}

/** Body of `POST /projects/:projectId/transfer-ownership`. */
export class TransferOwnershipDto {
  @IsString({ message: 'userId is required.' })
  @MinLength(1, { message: 'userId is required.' })
  userId!: string;
}
