import { SetMetadata } from '@nestjs/common';

export const THROTTLE_KEY = 'throttleLimit';
export const SKIP_THROTTLE_KEY = 'skipThrottle';

/** Limit for one route: at most `limit` requests per client IP per `ttlMs`. */
export interface ThrottleOptions {
  limit: number;
  ttlMs: number;
  /** Count only failed (4xx) requests: successful (2xx) and server-fault (5xx) ones are refunded. */
  failuresOnly?: boolean;
}

/** Overrides the global rate limit for a route, e.g. `@Throttle(10)` = 10 requests per minute. */
export const Throttle = (
  limit: number,
  ttlMs = 60_000,
  failuresOnly = false,
): ClassDecorator & MethodDecorator =>
  SetMetadata(THROTTLE_KEY, {
    limit,
    ttlMs,
    failuresOnly,
  } satisfies ThrottleOptions);

/** Exempts a route (e.g. health probes) from rate limiting. */
export const SkipThrottle = (): ClassDecorator & MethodDecorator =>
  SetMetadata(SKIP_THROTTLE_KEY, true);
