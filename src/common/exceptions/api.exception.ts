import { HttpException } from '@nestjs/common';
import type { ErrorCode } from '../dto/api-response.dto.js';

/** HttpException with a machine-readable `code` and optional field messages. */
export class ApiException extends HttpException {
  constructor(
    status: number,
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message, status);
  }
}
