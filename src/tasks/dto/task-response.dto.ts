import { ApiProperty } from '@nestjs/swagger';
import { UserSummaryResponse } from '../../common/dto/user-summary.dto.js';
import { LabelResponse } from '../../labels/dto/label-response.dto.js';

/** A task with its people and labels. */
export class TaskResponse {
  id!: string;
  projectId!: string;
  title!: string;
  @ApiProperty({ type: String, nullable: true })
  description!: string | null;
  @ApiProperty({ enum: ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] })
  status!: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] })
  priority!: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  /** Order inside a board column, smaller first. */
  position!: number;
  @ApiProperty({ type: Date, nullable: true })
  dueDate!: Date | null;
  @ApiProperty({ type: UserSummaryResponse, nullable: true })
  assignee!: UserSummaryResponse | null;
  creator!: UserSummaryResponse;
  labels!: LabelResponse[];
  commentCount!: number;
  /** Set when the task enters DONE, cleared when it leaves. */
  @ApiProperty({ type: Date, nullable: true })
  completedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

/** Tasks grouped by status; all four columns are always present. */
export class BoardResponse {
  TODO!: TaskResponse[];
  IN_PROGRESS!: TaskResponse[];
  IN_REVIEW!: TaskResponse[];
  DONE!: TaskResponse[];
}
