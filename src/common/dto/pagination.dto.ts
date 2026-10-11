import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Highest accepted page number, so offsets stay sane. */
export const MAX_PAGE = 100_000;

/** Base list query: `page` and `limit` (default 10, max 100); extend it with filters. */
export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;
}

/** Clamps a requested page to the last page that exists (API contract: past the end returns the last page). */
export function clampPage(page: number, limit: number, total: number): number {
  return Math.min(page, Math.max(1, Math.ceil(total / limit)));
}
