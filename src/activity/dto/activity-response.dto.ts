import { UserSummaryResponse } from '../../common/dto/user-summary.dto.js';

/** One entry of a project's activity log. */
export class ActivityResponse {
  id!: string;
  projectId!: string;
  projectName!: string;
  actor!: UserSummaryResponse;
  /** e.g. `task.moved`, `member.added`. */
  action!: string;
  /** Short phrase that follows the actor's name, e.g. `moved "Login page" to Done`. */
  message!: string;
  createdAt!: Date;
}
