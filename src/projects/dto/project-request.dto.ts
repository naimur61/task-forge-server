import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { Trim } from '../../common/decorators/transforms.decorator.js';
import { PageQueryDto } from '../../common/dto/pagination.dto.js';

/** Body of `POST /projects`. */
export class CreateProjectDto {
  @Trim()
  @IsString()
  @Length(2, 100, { message: 'Name must be between 2 and 100 characters.' })
  name!: string;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(1000, { message: 'Description must be at most 1000 characters.' })
  description?: string | null;
}

/** Body of `PATCH /projects/:projectId`; an empty description is stored as `null`. */
export class UpdateProjectDto {
  @IsOptional()
  @Trim()
  @IsString()
  @Length(2, 100, { message: 'Name must be between 2 and 100 characters.' })
  name?: string;

  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(1000, { message: 'Description must be at most 1000 characters.' })
  description?: string | null;
}

/** Query of `GET /projects`: name search, status and paging. */
export class QueryProjectsDto extends PageQueryDto {
  @IsOptional()
  @Trim()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(['ACTIVE', 'ARCHIVED'], {
    message: 'status must be ACTIVE or ARCHIVED.',
  })
  status?: 'ACTIVE' | 'ARCHIVED';
}
