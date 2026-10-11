import type { Request } from 'express';

/** Name of the refresh-token cookie. */
export const REFRESH_COOKIE = 'tf_refresh';

/** Path the refresh cookie is sent to (only the auth routes need it). */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** The signed-in user attached to the request by the `AuthGuard`. */
export interface AuthUser {
  id: string;
}

/** Express request after the `AuthGuard` ran. */
export type AuthenticatedRequest = Request & { user?: AuthUser };

/** Payload of the access token. */
export interface AccessTokenPayload {
  sub: string;
}
