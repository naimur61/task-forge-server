import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import {
  Lowercase,
  Trim,
} from '../../common/decorators/transforms.decorator.js';

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).+$/;
const PASSWORD_MESSAGE =
  'Password must contain at least 1 letter and 1 number.';

/** Body of `POST /auth/register`. */
export class RegisterDto {
  @Trim()
  @IsString()
  @Length(2, 80, { message: 'Name must be between 2 and 80 characters.' })
  name!: string;

  @Lowercase()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(128)
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password!: string;
}

/** Body of `POST /auth/login`. */
export class LoginDto {
  @Lowercase()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;

  @IsString()
  @MinLength(1, { message: 'Password is required.' })
  @MaxLength(128)
  password!: string;
}

/** Body of `PUT /auth/profile`; every field is optional. */
export class UpdateProfileDto {
  @IsOptional()
  @Trim()
  @IsString()
  @Length(2, 80, { message: 'Name must be between 2 and 80 characters.' })
  name?: string;

  @IsOptional()
  @Lowercase()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email?: string;

  /** Avatar URL; `null` removes it. */
  @ValidateIf((_, value) => value !== undefined && value !== null)
  @IsString()
  @MaxLength(2048)
  avatar?: string | null;
}

/** Body of `POST /auth/change-password`. */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Current password is required.' })
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(128)
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  newPassword!: string;
}

/** Body of `POST /auth/forgot-password`. */
export class ForgotPasswordDto {
  @Lowercase()
  @IsEmail({}, { message: 'Enter a valid email address.' })
  email!: string;
}

/** Body of `POST /auth/reset-password`. */
export class ResetPasswordDto {
  @IsString()
  @MinLength(1, { message: 'Token is required.' })
  token!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters.' })
  @MaxLength(128)
  @Matches(PASSWORD_RULE, { message: PASSWORD_MESSAGE })
  password!: string;
}
