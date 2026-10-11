import { ApiProperty } from '@nestjs/swagger';

/** The signed-in user (note: `avatar`, not `avatarUrl`, in the auth routes). */
export class AuthUserResponse {
  id!: string;
  name!: string;
  email!: string;
  @ApiProperty({ type: String, nullable: true })
  avatar!: string | null;
}

/** Result of register and login. */
export class AuthSessionResponse {
  user!: AuthUserResponse;
  /** JWT, sent as `Authorization: Bearer <token>`. */
  accessToken!: string;
}

/** Result of a token refresh. */
export class AccessTokenResponse {
  accessToken!: string;
}
