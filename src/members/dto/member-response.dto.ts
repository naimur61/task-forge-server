import { ApiProperty } from '@nestjs/swagger';
import { UserSummaryResponse } from '../../common/dto/user-summary.dto.js';

/** A project membership. */
export class MemberResponse {
  id!: string;
  projectId!: string;
  @ApiProperty({ enum: ['OWNER', 'ADMIN', 'MEMBER'] })
  role!: 'OWNER' | 'ADMIN' | 'MEMBER';
  joinedAt!: Date;
  user!: UserSummaryResponse;
}
