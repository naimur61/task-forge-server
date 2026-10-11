import { ValidationPipe, type ValidationError } from '@nestjs/common';
import { ErrorCodes } from '../dto/api-response.dto.js';
import { ApiException } from '../exceptions/api.exception.js';

/** Flattens class-validator errors into a `fields` map keyed by dotted path, first message wins. */
export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
  out: Record<string, string> = {},
): Record<string, string> {
  for (const err of errors) {
    const path = parent ? `${parent}.${err.property}` : err.property;
    const first = err.constraints
      ? Object.values(err.constraints)[0]
      : undefined;
    if (first !== undefined && out[path] === undefined) out[path] = first;
    if (err.children?.length) flattenValidationErrors(err.children, path, out);
  }
  return out;
}

/** Builds the strict global validation pipe (unknown fields rejected, explicit conversion only). */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => {
      const fields = flattenValidationErrors(errors);
      return new ApiException(
        400,
        ErrorCodes.VALIDATION_ERROR,
        Object.values(fields)[0] ?? 'Request validation failed.',
        fields,
      );
    },
  });
}
