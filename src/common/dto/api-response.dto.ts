/** Pagination block of a list response, plus resource-specific extras. */
export interface MetaDto {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  /** Resource-specific extras, e.g. `unread` on the notifications list. */
  [extra: string]: unknown;
}

/** Success envelope: `{ data, meta? }`. */
export interface ApiSuccess<T> {
  data: T;
  meta?: MetaDto;
}

/** Machine-readable error codes for `code`. */
export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNPROCESSABLE: 'UNPROCESSABLE',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  INTERNAL: 'INTERNAL',
} as const;

/** Known codes autocomplete, but resource-specific codes (e.g. `EMAIL_TAKEN`) are allowed. */
export type ErrorCode =
  (typeof ErrorCodes)[keyof typeof ErrorCodes] | (string & {});

/** One field-level validation problem. */
export interface ErrorDetail {
  field: string;
  message: string;
}

/** Error body of BACKEND_API.md section 1: the frontend shows `message` and maps `details[].field` to form fields. */
export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  code: ErrorCode;
  details: ErrorDetail[];
}

/** Service result for list endpoints, recognised by the envelope interceptor via `instanceof`. */
export class Paginated<T> {
  constructor(
    readonly rows: T[],
    readonly total: number,
    readonly page: number,
    readonly limit: number,
    /** Merged into `meta` (e.g. `{ unread: 2 }`). */
    readonly extraMeta?: Record<string, unknown>,
  ) {}

  /** Builds the `meta` block, including `totalPages` (at least 1). */
  toMeta(): MetaDto {
    const totalPages = Math.max(1, Math.ceil(this.total / this.limit));
    return {
      ...this.extraMeta,
      page: this.page,
      limit: this.limit,
      total: this.total,
      totalPages,
      hasNext: this.page < totalPages,
      hasPrev: this.page > 1,
    };
  }
}

/** Builds a paginated service result. */
export function paginated<T>(
  rows: T[],
  total: number,
  page: number,
  limit: number,
  extraMeta?: Record<string, unknown>,
): Paginated<T> {
  return new Paginated(rows, total, page, limit, extraMeta);
}
