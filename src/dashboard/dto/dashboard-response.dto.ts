import { ApiProperty } from '@nestjs/swagger';
import { ActivityResponse } from '../../activity/dto/activity-response.dto.js';
import { TaskResponse } from '../../tasks/dto/task-response.dto.js';

/** Project counts of the signed-in user. */
export class ProjectTotals {
  total!: number;
  active!: number;
  archived!: number;
}

/** Task counts over the user's projects. */
export class TaskTotals {
  total!: number;
  /** Status DONE. */
  completed!: number;
  inProgress!: number;
  /** Past due and not DONE. */
  overdue!: number;
  /** HIGH or URGENT and not DONE. */
  highPriority!: number;
  /** Assigned to me and not DONE. */
  assignedToMe!: number;
}

/** Number of tasks in one status. */
export class StatusCount {
  @ApiProperty({ enum: ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] })
  status!: string;
  count!: number;
}

/** Number of tasks with one priority. */
export class PriorityCount {
  @ApiProperty({ enum: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] })
  priority!: string;
  count!: number;
}

/** Tasks completed on one day. */
export class TrendPoint {
  /** `YYYY-MM-DD`. */
  date!: string;
  completed!: number;
}

/** Cross-project overview; covers only projects the user belongs to. */
export class DashboardSummaryResponse {
  projects!: ProjectTotals;
  tasks!: TaskTotals;
  /** Always all four statuses, in board order. */
  byStatus!: StatusCount[];
  /** Always all four priorities, lowest first. */
  byPriority!: PriorityCount[];
  /** The last 14 days, oldest first, every day present. */
  completionTrend!: TrendPoint[];
  /** The newest 8 entries. */
  recentActivity!: ActivityResponse[];
}

/** A task assigned to me, with its project name. */
export class MyTaskResponse extends TaskResponse {
  projectName!: string;
}
