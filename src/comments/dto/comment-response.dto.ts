import { UserSummaryResponse } from '../../common/dto/user-summary.dto.js';

/** A comment on a task. */
export class CommentResponse {
  id!: string;
  taskId!: string;
  body!: string;
  author!: UserSummaryResponse;
  createdAt!: Date;
  updatedAt!: Date;
}
