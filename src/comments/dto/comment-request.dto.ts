import { IsString, Length } from 'class-validator';
import { Trim } from '../../common/decorators/transforms.decorator.js';

/** Body of comment create and edit. */
export class CommentBodyDto {
  @Trim()
  @IsString({ message: 'Comment is required.' })
  @Length(1, 2000, {
    message: 'Comment must be between 1 and 2000 characters.',
  })
  body!: string;
}
