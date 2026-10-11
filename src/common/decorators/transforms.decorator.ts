import { Transform } from 'class-transformer';

/** Trims whitespace on strings and leaves other types for the validators. */
export const Trim = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

/** Lowercases and trims strings (emails). */
export const Lowercase = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

/** Converts an empty string to `null`; apply after `@Trim()`. */
export const NullIfEmpty = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => (value === '' ? null : value));

/** Turns `?a=1&a=2` and `?a=1,2` into `['1', '2']`; empty input becomes `undefined`. */
export const ToArray = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const list = Array.isArray(value) ? value : [value];
    return list.flatMap((v) => String(v).split(',')).filter(Boolean);
  });
