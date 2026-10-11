import { ErrorCodes } from '../dto/api-response.dto.js';
import { ApiException } from '../exceptions/api.exception.js';

/** Result of `parseSort`. */
export interface ParsedSort<TField extends string> {
  field: TField;
  direction: 'asc' | 'desc';
}

/** Checks a `sortBy` value against the allowed fields, or throws 400. */
export function parseSortField<TField extends string>(
  sortBy: string | undefined,
  allowedFields: readonly TField[],
  defaultField: TField,
): TField {
  if (!sortBy) return defaultField;
  if (!allowedFields.includes(sortBy as TField)) {
    throw new ApiException(
      400,
      ErrorCodes.VALIDATION_ERROR,
      `Invalid sort field "${sortBy}". Allowed: ${allowedFields.join(', ')}`,
      { sortBy: `Allowed: ${allowedFields.join(', ')}` },
    );
  }
  return sortBy as TField;
}
