import { IsOptional, IsString } from 'class-validator';

/** Query of `GET /users/search`. */
export class QueryUsersDto {
  /** Matches name or email; fewer than 2 characters returns an empty list. */
  @IsOptional()
  @IsString()
  q?: string;
}
