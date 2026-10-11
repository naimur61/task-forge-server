import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ToBoolean } from '../../common/decorators/to-boolean.decorator.js';
import { ToArray, Trim } from '../../common/decorators/transforms.decorator.js';
import { PageQueryDto } from '../../common/dto/pagination.dto.js';
import { PRIORITIES, STATUSES } from '../../common/utils/ranks.js';

const STATUS_MESSAGE = `status must be one of ${STATUSES.join(', ')}.`;
const PRIORITY_MESSAGE = `priority must be one of ${PRIORITIES.join(', ')}.`;
const TITLE_MESSAGE = 'Title must be between 1 and 200 characters.';

type Status = (typeof STATUSES)[number];
type Priority = (typeof PRIORITIES)[number];

/** Body of `PATCH /tasks/:taskId`: any subset of the task input. */
export class UpdateTaskDto {
  @IsOptional()
  @Trim()
  @IsString()
  @Length(1, 200, { message: TITLE_MESSAGE })
  title?: string;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(5000, { message: 'Description must be at most 5000 characters.' })
  description?: string | null;

  @IsOptional()
  @IsEnum(STATUSES, { message: STATUS_MESSAGE })
  status?: Status;

  @IsOptional()
  @IsEnum(PRIORITIES, { message: PRIORITY_MESSAGE })
  priority?: Priority;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsISO8601({}, { message: 'dueDate must be a valid date.' })
  dueDate?: string | null;

  /** Must be a member of the project, otherwise 422 `ASSIGNEE_NOT_MEMBER`. */
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  assigneeId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  labelIds?: string[];
}

/** Body of `POST /tasks`: same as the update, but `title` is required. */
export class CreateTaskDto extends UpdateTaskDto {
  @Trim()
  @IsString({ message: 'Title is required.' })
  @Length(1, 200, { message: TITLE_MESSAGE })
  declare title: string;
}

/** Body of `PATCH /tasks/:taskId/move` (drag and drop). */
export class MoveTaskDto {
  @IsEnum(STATUSES, { message: STATUS_MESSAGE })
  status!: Status;

  /** Place the task directly after this one; `null` or missing means the top of the column. */
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  afterId?: string | null;
}

/** Filters shared by the list and the board. */
export class TaskFilterDto {
  @IsOptional()
  @Trim()
  @IsString()
  search?: string;

  @IsOptional()
  @ToArray()
  @IsArray()
  @IsEnum(STATUSES, { each: true, message: STATUS_MESSAGE })
  status?: Status[];

  @IsOptional()
  @ToArray()
  @IsArray()
  @IsEnum(PRIORITIES, { each: true, message: PRIORITY_MESSAGE })
  priority?: Priority[];

  /** A user id, `me` or `unassigned`. */
  @IsOptional()
  @IsString()
  assigneeId?: string;

  /** Tasks having any of these labels. */
  @IsOptional()
  @ToArray()
  @IsArray()
  @IsString({ each: true })
  labelId?: string[];

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  overdue?: boolean;
}

/** Fields `?sortBy=` accepts. */
export const TASK_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'dueDate',
  'priority',
  'title',
] as const;

/** Query of `GET /tasks`: the filters plus sort and paging. */
export class QueryTasksDto extends PageQueryDto {
  @IsOptional()
  @Trim()
  @IsString()
  search?: string;

  @IsOptional()
  @ToArray()
  @IsArray()
  @IsEnum(STATUSES, { each: true, message: STATUS_MESSAGE })
  status?: Status[];

  @IsOptional()
  @ToArray()
  @IsArray()
  @IsEnum(PRIORITIES, { each: true, message: PRIORITY_MESSAGE })
  priority?: Priority[];

  @IsOptional()
  @IsString()
  assigneeId?: string;

  @IsOptional()
  @ToArray()
  @IsArray()
  @IsString({ each: true })
  labelId?: string[];

  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  overdue?: boolean;

  @IsOptional()
  @IsIn(TASK_SORT_FIELDS, {
    message: `sortBy must be one of ${TASK_SORT_FIELDS.join(', ')}.`,
  })
  sortBy?: (typeof TASK_SORT_FIELDS)[number];

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'order must be asc or desc.' })
  order?: 'asc' | 'desc';
}
