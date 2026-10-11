import { ApiProperty } from '@nestjs/swagger';
import { UserSummaryResponse } from '../../common/dto/user-summary.dto.js';

/** A project as seen by the current user. */
export class ProjectResponse {
  id!: string;
  name!: string;
  @ApiProperty({ type: String, nullable: true })
  description!: string | null;
  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] })
  status!: 'ACTIVE' | 'ARCHIVED';
  ownerId!: string;
  /** Role of the current user in this project. */
  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'MEMBER'] })
  myRole!: 'OWNER' | 'ADMIN' | 'MEMBER';
  memberCount!: number;
  /** The first four members. */
  @ApiProperty({ type: [UserSummaryResponse] })
  membersPreview!: UserSummaryResponse[];
  taskCount!: number;
  /** Tasks with status DONE. */
  doneCount!: number;
  /** Tasks past their due date that are not DONE. */
  overdueCount!: number;
  createdAt!: Date;
  updatedAt!: Date;
}
