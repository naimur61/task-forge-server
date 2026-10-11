import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { tap, type Observable } from 'rxjs';
import { LOCATION_KEY } from '../decorators/location.decorator.js';

/** Sets `Location` from `@CreatedAt('/api/v1/things/:id')` using the handler's result. */
@Injectable()
export class LocationInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  /** Sets the `Location` header after the handler returns, if the route has a template. */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const template = this.reflector.get<string | undefined>(
      LOCATION_KEY,
      context.getHandler(),
    );
    if (!template) return next.handle();
    const res = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      tap((result) => {
        const id = (result as { id?: string | number } | null)?.id;
        if (id !== undefined)
          res.location(template.replace(':id', encodeURIComponent(String(id))));
      }),
    );
  }
}
