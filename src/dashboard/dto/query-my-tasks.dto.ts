import { IsBoolean, IsOptional } from 'class-validator';
import { ToBoolean } from '../../common/decorators/to-boolean.decorator.js';
import { PageQueryDto } from '../../common/dto/pagination.dto.js';

/** Query of `GET /dashboard/my-tasks`. */
export class QueryMyTasksDto extends PageQueryDto {
  /** Only tasks past their due date. */
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  overdue?: boolean;
}
