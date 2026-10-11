import { ApiProperty } from '@nestjs/swagger';

/** A notification of the signed-in user. */
export class NotificationResponse {
  id!: string;
  /** e.g. `task.assigned`, `member.added`. */
  type!: string;
  message!: string;
  /** Frontend route to open, e.g. `/projects/prj_1/board`. */
  @ApiProperty({ type: String, nullable: true })
  link!: string | null;
  @ApiProperty({ type: Date, nullable: true })
  readAt!: Date | null;
  createdAt!: Date;
}
