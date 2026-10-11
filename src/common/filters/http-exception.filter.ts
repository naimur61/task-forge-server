import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../../generated/prisma/client.js';
import { ErrorCodes, type ApiError } from '../dto/api-response.dto.js';
import { ApiException } from '../exceptions/api.exception.js';

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

/** Turns every error into the `{ statusCode, error, message, code, details }` body of the API contract. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  /** Writes the error body to the response and logs 5xx errors. */
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const body = this.toBody(exception);

    if (body.statusCode >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} → ${body.statusCode}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (res.headersSent) return;
    res.status(body.statusCode).json(body);
  }

  /** Maps any thrown value to the error body (unknown errors → generic 500). */
  private toBody(exception: unknown): ApiError {
    if (exception instanceof ApiException) {
      return this.build(
        exception.getStatus(),
        exception.message,
        exception.code,
        exception.fields,
      );
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return this.build(
        status,
        status === HttpStatus.TOO_MANY_REQUESTS
          ? 'Too many requests. Please try again later.'
          : this.messageOf(exception),
      );
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        return this.build(
          409,
          'A record with the same unique value already exists.',
        );
      }
      if (exception.code === 'P2025') {
        return this.build(404, 'Resource not found.');
      }
    }

    return this.build(500, 'Internal server error.', ErrorCodes.INTERNAL);
  }

  /** Builds the body; `fields` become the `details` array. */
  private build(
    status: number,
    message: string,
    code?: string,
    fields?: Record<string, string>,
  ): ApiError {
    const [error, defaultCode] = STATUS_INFO[status] ?? [
      'Internal Server Error',
      ErrorCodes.INTERNAL,
    ];
    return {
      statusCode: status,
      error,
      message,
      code: code ?? defaultCode,
      details: Object.entries(fields ?? {}).map(([field, text]) => ({
        field,
        message: text,
      })),
    };
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
