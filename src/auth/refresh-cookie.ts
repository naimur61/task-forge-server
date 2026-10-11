import type { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import type { Env } from '../core/env.validation.js';
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH } from './auth.types.js';

/** Builds the cookie flags from the environment (`Secure` defaults to on in production). */
function cookieOptions(config: ConfigService<Env, true>): CookieOptions {
  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';
  const domain = config.get('COOKIE_DOMAIN', { infer: true });
  return {
    httpOnly: true,
    secure: config.get('COOKIE_SECURE', { infer: true }) ?? isProduction,
    sameSite: config.get('COOKIE_SAMESITE', { infer: true }),
    path: REFRESH_COOKIE_PATH,
    ...(domain && { domain }),
  };
}

/** Sets the refresh-token cookie. */
export function setRefreshCookie(
  res: Response,
  config: ConfigService<Env, true>,
  token: string,
): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...cookieOptions(config),
    maxAge: config.get('REFRESH_TTL_DAYS', { infer: true }) * 86_400_000,
  });
}

/** Clears the refresh-token cookie. */
export function clearRefreshCookie(
  res: Response,
  config: ConfigService<Env, true>,
): void {
  res.clearCookie(REFRESH_COOKIE, cookieOptions(config));
}
