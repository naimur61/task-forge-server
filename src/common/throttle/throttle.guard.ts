import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { Env } from '../../core/env.validation.js';
import {
  SKIP_THROTTLE_KEY,
  THROTTLE_KEY,
  type ThrottleOptions,
} from './throttle.decorator.js';

/** Request count of one client in the current window. */
interface Bucket {
  count: number;
  resetAt: number;
}

/** Table size above which expired buckets are dropped. */
const PURGE_THRESHOLD = 10_000;

/**
 * In-memory rate limiter per client IP (single instance only; use a shared store when scaling out).
 * Written in-house because `@nestjs/throttler` is CommonJS-only and cannot load the ESM-only Nest 12.
 */
@Injectable()
export class ThrottleGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Counts the request and answers 429 with `Retry-After` once the limit is used up. */
  canActivate(context: ExecutionContext): boolean {
    if (!this.config.get('THROTTLE_ENABLED', { infer: true })) return true;
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean | undefined>(
        SKIP_THROTTLE_KEY,
        targets,
      )
    ) {
      return true;
    }

    const override = this.reflector.getAllAndOverride<
      ThrottleOptions | undefined
    >(THROTTLE_KEY, targets);
    const { limit, ttlMs, failuresOnly } = override ?? {
      limit: this.config.get('THROTTLE_LIMIT', { infer: true }),
      ttlMs: this.config.get('THROTTLE_TTL_MS', { infer: true }),
      failuresOnly: false,
    };
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    // Overridden routes get their own bucket so a strict limit does not eat the global budget.
    const route = override
      ? `${context.getClass().name}.${context.getHandler().name}`
      : 'global';
    const bucket = this.hit(`${req.ip ?? 'unknown'}|${route}`, ttlMs);

    const res = http.getResponse<Response>();

    if (bucket.count <= limit) {
      // Refund requests that did not fail on the client's side (e.g. a successful login or a 5xx).
      if (failuresOnly) {
        res.once('finish', () => {
          const failed = res.statusCode >= 400 && res.statusCode < 500;
          if (!failed && bucket.count > 0) bucket.count -= 1;
        });
      }
      return true;
    }
    res.setHeader(
      'Retry-After',
      Math.max(1, Math.ceil((bucket.resetAt - Date.now()) / 1000)),
    );
    throw new HttpException('Too many requests.', 429);
  }

  /** Adds one hit to the key's window, starting a new window when the old one expired. */
  private hit(key: string, ttlMs: number): Bucket {
    const now = Date.now();
    if (this.buckets.size > PURGE_THRESHOLD) {
      for (const [k, b] of this.buckets)
        if (b.resetAt <= now) this.buckets.delete(k);
    }
    const existing = this.buckets.get(key);
    if (existing && existing.resetAt > now) {
      existing.count += 1;
      return existing;
    }
    const fresh = { count: 1, resetAt: now + ttlMs };
    this.buckets.set(key, fresh);
    return fresh;
  }
}
