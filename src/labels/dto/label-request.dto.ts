import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { Trim } from '../../common/decorators/transforms.decorator.js';

/** Body of `POST /projects/:projectId/labels`. */
export class CreateLabelDto {
  @Trim()
  @IsString({ message: 'Name is required.' })
  @Length(1, 50, { message: 'Name must be between 1 and 50 characters.' })
  name!: string;

  /** Hex colour; defaults to `#6366f1`. */
  @IsOptional()
  @Matches(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, {
    message: 'Color must be a hex value like #6366f1.',
  })
  color?: string;
}
