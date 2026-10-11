import { Transform } from 'class-transformer';

/** Converts `"true"`/`"false"` to booleans and leaves other values for `@IsBoolean()` to reject. */
export const ToBoolean = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  });
