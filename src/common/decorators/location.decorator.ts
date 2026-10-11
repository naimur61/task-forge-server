import { SetMetadata } from '@nestjs/common';

export const LOCATION_KEY = 'locationTemplate';

/** Adds a `Location` header to a 201 response; `:id` is replaced with `result.id`. */
export const CreatedAt = (template: string): MethodDecorator =>
  SetMetadata(LOCATION_KEY, template);
