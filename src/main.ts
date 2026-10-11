import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { VersioningType } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import type { Env } from './core/env.validation.js';
import { setupSwagger } from './core/swagger.js';

/** Creates the Nest app, applies HTTP settings and starts listening. */
async function bootstrap(): Promise<void> {
  // Logs are buffered until the pino logger is attached below.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // Attaches the pino logger to the app.
  app.useLogger(app.get(Logger));

  // Runs onModuleDestroy (closes the DB pool) on SIGTERM / SIGINT.
  app.enableShutdownHooks();
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true }));

  // Routes live under /api/v1 (global prefix + URI versioning).
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Exact frontend origin(s), never `*`, so the refresh cookie can be sent.
  app.enableCors({
    origin: config.get('FRONTEND_ORIGINS', { infer: true }),
    credentials: true,
    maxAge: 600,
  });

  const isProduction = config.get('NODE_ENV', { infer: true }) === 'production';
  if (config.get('SWAGGER_ENABLED', { infer: true }) ?? !isProduction) {
    setupSwagger(app);
  }

  await app.listen(config.get('PORT', { infer: true }));
}

void bootstrap();
