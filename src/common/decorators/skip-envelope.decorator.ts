import { SetMetadata } from '@nestjs/common';

export const SKIP_ENVELOPE_KEY = 'skipEnvelope';

/** Opts a handler or controller out of the `{ data, meta? }` envelope (used by `/auth/*`). */
export const SkipEnvelope = (): ClassDecorator & MethodDecorator =>
  SetMetadata(SKIP_ENVELOPE_KEY, true);
