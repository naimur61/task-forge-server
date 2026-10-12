import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Prisma } from '../../../generated/prisma/client.js';
import type { Env } from '../../core/env.validation.js';
import { ErrorCodes, type ApiError } from '../dto/api-response.dto.js';
import { ApiException } from '../exceptions/api.exception.js';
import { isDbUnavailable } from '../utils/prisma-errors.js';

/** Maps HTTP status codes to the `error` text and the default `code`. */
const STATUS_INFO: Readonly<Record<number, readonly [string, string]>> = {
  400: ['Bad Request', ErrorCodes.VALIDATION_ERROR],
  401: ['Unauthorized', ErrorCodes.UNAUTHORIZED],
  403: ['Forbidden', ErrorCodes.FORBIDDEN],
  404: ['Not Found', ErrorCodes.NOT_FOUND],
  409: ['Conflict', ErrorCodes.CONFLICT],
  413: ['Payload Too Large', ErrorCodes.PAYLOAD_TOO_LARGE],
  422: ['Unprocessable Entity', ErrorCodes.UNPROCESSABLE],
  429: ['Too Many Requests', ErrorCodes.TOO_MANY_REQUESTS],
  503: ['Service Unavailable', ErrorCodes.SERVICE_UNAVAILABLE],
};

/** Statuses a client can sensibly retry. */
const RETRYABLE = new Set([408, 429, 502, 503, 504]);

/** Stack lines kept in `debug.stack`. */
const DEBUG_STACK_LINES = 8;

/** What `toBody` decided, before request context is added. */
type Core = Pick<ApiError, 'statusCode' | 'message' | 'code' | 'details'> & {
  hint?: string;
  retryable?: boolean;
};

/** Turns every error into the `{ statusCode, error, message, code, details, requestId, … }` body of the API contract. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  /** Writes the error body to the response and logs 5xx errors with the request id. */
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const core = this.toCore(exception);
    const requestId = this.requestIdOf(req, res);
    const path = `${req.method} ${req.originalUrl}`;

    if (core.statusCode >= 500) {
      this.logger.error(
        `${path} → ${core.statusCode} [${core.code}] requestId=${requestId ?? '-'}: ${this.describe(exception)}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (res.headersSent) return;
    if (core.statusCode === 503 && !res.getHeader('Retry-After')) {
      res.setHeader('Retry-After', 2);
    }
    res
      .status(core.statusCode)
      .json(this.build(core, path, requestId, exception));
  }

  /** Maps any thrown value to status, message and code (unknown errors → 500 `INTERNAL`). */
  private toCore(exception: unknown): Core {
    if (exception instanceof ApiException) {
      return this.core(
        exception.getStatus(),
        exception.message,
        exception.code,
        exception.fields,
      );
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return this.core(
        status,
        status === HttpStatus.TOO_MANY_REQUESTS
          ? 'Too many requests. Please try again later.'
          : this.messageOf(exception),
      );
    }

    // Checked before the generic Prisma mapping: pool exhaustion is also a known-request error.
    if (isDbUnavailable(exception)) {
      return {
        ...this.core(
          503,
          'The service cannot reach its database right now. Please retry in a few seconds.',
          ErrorCodes.DATABASE_UNAVAILABLE,
        ),
        hint: 'Database connection failed or the connection limit is exhausted. Check DATABASE_URL, use the provider’s pooled URL on serverless, and keep DB_POOL_MAX low (1 on Vercel).',
        retryable: true,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return this.core(
            409,
            'A record with the same unique value already exists.',
          );
        case 'P2003':
          return {
            ...this.core(
              409,
              'The request refers to a record that does not exist.',
            ),
            hint: 'Foreign-key constraint failed; check the referenced ids.',
          };
        case 'P2025':
          return this.core(404, 'Resource not found.');
        case 'P2034':
          return {
            ...this.core(
              409,
              'The change conflicted with another request. Please retry.',
            ),
            retryable: true,
          };
        default:
          return {
            ...this.core(
              500,
              'The database rejected the request.',
              'DATABASE_ERROR',
            ),
            hint: `Prisma error ${exception.code}. See https://www.prisma.io/docs/orm/reference/error-reference#${exception.code.toLowerCase()} and search the server log for the requestId.`,
          };
      }
    }

    if (exception instanceof Prisma.PrismaClientValidationError) {
      return {
        ...this.core(
          500,
          'The server built an invalid database query.',
          'DATABASE_ERROR',
        ),
        hint: 'Prisma validation error: this is a server bug (query does not match the schema or the Prisma client is out of date; run `prisma generate`). Search the server log for the requestId.',
      };
    }

    return {
      ...this.core(
        500,
        'Something went wrong on our side.',
        ErrorCodes.INTERNAL,
      ),
      hint: 'Unexpected server error. Search the server log for the requestId to find the stack trace.',
    };
  }

  /** Core with the default `code` of the status and `fields` turned into `details`. */
  private core(
    status: number,
    message: string,
    code?: string,
    fields?: Record<string, string>,
  ): Core {
    const [, defaultCode] = STATUS_INFO[status] ?? ['', ErrorCodes.INTERNAL];
    return {
      statusCode: status,
      message,
      code: code ?? defaultCode,
      details: Object.entries(fields ?? {}).map(([field, text]) => ({
        field,
        message: text,
      })),
    };
  }

  /** Adds request context and, when enabled, the underlying error. */
  private build(
    core: Core,
    path: string,
    requestId: string | undefined,
    exception: unknown,
  ): ApiError {
    const [error] = STATUS_INFO[core.statusCode] ?? ['Internal Server Error'];
    const body: ApiError = {
      statusCode: core.statusCode,
      error: error ?? 'Internal Server Error',
      message: core.message,
      code: core.code,
      details: core.details,
      requestId,
      timestamp: new Date().toISOString(),
      path,
      retryable: core.retryable ?? RETRYABLE.has(core.statusCode),
    };
    if (core.hint) body.hint = core.hint;
    if (
      core.statusCode >= 500 &&
      this.debugEnabled() &&
      exception instanceof Error
    ) {
      body.debug = {
        name: exception.name,
        message: exception.message,
        ...(exception instanceof Prisma.PrismaClientKnownRequestError && {
          prismaCode: exception.code,
        }),
        stack: exception.stack?.split('\n').slice(0, DEBUG_STACK_LINES),
      };
    }
    return body;
  }

  /** Debug details are on outside production unless `ERROR_DEBUG` says otherwise. */
  private debugEnabled(): boolean {
    return (
      this.config.get('ERROR_DEBUG', { infer: true }) ??
      this.config.get('NODE_ENV', { infer: true }) !== 'production'
    );
  }

  /** The id pino-http gave the request (also sent as `X-Request-Id`). */
  private requestIdOf(req: Request, res: Response): string | undefined {
    const id =
      (req as Request & { id?: unknown }).id ?? res.getHeader('X-Request-Id');
    return id === undefined || id === null ? undefined : String(id);
  }

  /** One-line description of the thrown value for the log message. */
  private describe(exception: unknown): string {
    return exception instanceof Error
      ? `${exception.name}: ${exception.message.split('\n').filter(Boolean).pop() ?? ''}`
      : String(exception);
  }

  /** Extracts a plain message from a Nest exception response. */
  private messageOf(exception: HttpException): string {
    const resp = exception.getResponse();
    if (typeof resp === 'string') return resp;
    const message = (resp as { message?: string | string[] }).message;
    if (Array.isArray(message)) return message.join('; ');
    return message ?? exception.message;
  }
}
