import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import { SKIP_ENVELOPE_KEY } from '../decorators/skip-envelope.decorator.js';
import { Paginated, type ApiSuccess } from '../dto/api-response.dto.js';

/** Wraps successful responses in `{ data, meta? }`, except 204s and `@SkipEnvelope()` routes. */
@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  /** Wraps the handler result unless the route opted out of the envelope. */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skip = this.reflector.getAllAndOverride<boolean | undefined>(
      SKIP_ENVELOPE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (skip) return next.handle();
    return next.handle().pipe(map((value) => this.wrap(value)));
  }

  /** Wraps one value: paginated results get `meta`, anything else goes into `data`. */
  private wrap(value: unknown): unknown {
    if (value === undefined) return value;
    if (value instanceof Paginated) {
      return { data: value.rows, meta: value.toMeta() } satisfies ApiSuccess<
        unknown[]
      >;
    }
    return { data: value } satisfies ApiSuccess<unknown>;
  }
}
