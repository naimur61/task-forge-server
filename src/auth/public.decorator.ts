import { SetMetadata } from '@nestjs/common';

/** Metadata key set by `@Public()`. */
export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route reachable without a token (routes need a valid access token by default). */
export const Public = (): ClassDecorator & MethodDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
