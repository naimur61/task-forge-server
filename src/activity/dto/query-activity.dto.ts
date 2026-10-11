import { PageQueryDto } from '../../common/dto/pagination.dto.js';

/** Query of `GET /projects/:projectId/activity`; pages hold 20 entries unless told otherwise. */
export class QueryActivityDto extends PageQueryDto {
  override limit: number = 20;
}
