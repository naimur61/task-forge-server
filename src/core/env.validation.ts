import { z } from 'zod';

/** Parses `"true"` / `"false"` strings into booleans. */
const booleanish = z.enum(['true', 'false']).transform((v) => v === 'true');

/** Zod schema of all environment variables; the app refuses to boot if it fails. */
export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),

    DATABASE_URL: z.url(),
    /** Connections per instance; defaults to 1 on Vercel (one pool per function instance). */
    DB_POOL_MAX: z.coerce.number().int().min(1).max(100).optional(),
    DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(100).default(5_000),
    DB_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(30_000),
    DB_SSL: booleanish.default(false),

    /** Comma-separated list of allowed browser origins. Required in production. */
    FRONTEND_ORIGIN: z.string().optional(),
    /** Number of reverse-proxy hops to trust for `req.ip` (0 = none). */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** Defaults to `pretty` outside production and `json` in production. */
    LOG_FORMAT: z.enum(['json', 'pretty']).optional(),

    /** Global rate limit per IP (default 600 per minute). */
    THROTTLE_TTL_MS: z.coerce.number().int().min(1_000).default(60_000),
    THROTTLE_LIMIT: z.coerce.number().int().min(1).default(600),
    /** Master switch for rate limiting (tests turn it off; never disable in production). */
    THROTTLE_ENABLED: booleanish.default(true),

    /** OpenAPI UI at `/api/docs`. Defaults to on outside production. */
    SWAGGER_ENABLED: booleanish.optional(),

    // Authentication.
    /** HMAC key for access tokens; rotating it signs everyone out. */
    JWT_ACCESS_SECRET: z
      .string()
      .min(32, 'must be at least 32 characters (try: openssl rand -base64 48)'),
    JWT_ACCESS_TTL_MINUTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(1_440)
      .default(15),
    REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
    PASSWORD_RESET_TTL_MINUTES: z.coerce
      .number()
      .int()
      .min(5)
      .max(1_440)
      .default(60),
    /** `Secure` cookie flag; on by default in production. */
    COOKIE_SECURE: booleanish.optional(),
    /** `none` only for a frontend on another registrable domain (requires Secure). */
    COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
    COOKIE_DOMAIN: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });

    if (env.COOKIE_SAMESITE === 'none' && env.COOKIE_SECURE === false) {
      issue(
        'COOKIE_SECURE',
        'must not be false when COOKIE_SAMESITE=none (browsers reject it).',
      );
    }

    if (env.NODE_ENV !== 'production') return;
    if (!env.FRONTEND_ORIGIN?.trim()) {
      issue(
        'FRONTEND_ORIGIN',
        'is required in production (exact frontend origin, no wildcard).',
      );
    }
  });

/** Env schema plus the derived `FRONTEND_ORIGINS`. */
const derivedEnvSchema = envSchema.transform((env) => ({
  ...env,
  /** Effective pool size: explicit value, else 1 on Vercel, else 10. */
  DB_POOL_MAX: env.DB_POOL_MAX ?? (process.env['VERCEL'] ? 1 : 10),
  /** `FRONTEND_ORIGIN` as a list without trailing slashes (dev fallback: localhost 3000 and 4000). */
  FRONTEND_ORIGINS: (env.FRONTEND_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .concat(
      env.FRONTEND_ORIGIN?.trim()
        ? []
        : ['http://localhost:3000', 'http://localhost:4000'],
    ),
}));

/** The validated environment including derived values. */
export type Env = z.infer<typeof derivedEnvSchema>;

/** Validates raw env variables and returns the parsed config, or throws listing every issue. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = derivedEnvSchema.safeParse(raw);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`,
    );
    throw new Error(`Invalid environment variables:\n${lines.join('\n')}`);
  }
  return result.data;
}
