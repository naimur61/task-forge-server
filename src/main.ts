import { ConfigService } from '@nestjs/config';
import { createApp } from './app.factory.js';
import type { Env } from './core/env.validation.js';

/** Creates the Nest app and starts listening. */
async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
