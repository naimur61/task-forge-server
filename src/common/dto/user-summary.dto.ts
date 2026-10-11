import { ApiProperty } from '@nestjs/swagger';

/** Prisma `select` that yields a `UserSummaryResponse`. */
export const USER_SUMMARY_SELECT = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
} as const;

/** Small user embedded in other objects. */
export class UserSummaryResponse {
  id!: string;
  name!: string;
  email!: string;
  @ApiProperty({ type: String, nullable: true })
  avatarUrl!: string | null;
}
