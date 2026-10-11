import { randomUUID } from 'node:crypto';
import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import compression from 'compression';
import type { RequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import helmetModule from 'helmet';
import { LoggerModule } from 'nestjs-pino';
import { HttpExceptionFilter } from '../common/filters/http-exception.filter.js';
import { LocationInterceptor } from '../common/interceptors/location.interceptor.js';
import { ResponseEnvelopeInterceptor } from '../common/interceptors/response-envelope.interceptor.js';
import { createValidationPipe } from '../common/pipes/validation.pipe.js';
import { type Env, validateEnv } from './env.validation.js';

/** What we use of helmet; typed by hand because its CJS typings resolve differently across build environments. */
type HelmetFactory = (options?: HelmetOptions) => RequestHandler;
type HelmetOptions = {
  crossOriginResourcePolicy?: { policy: 'cross-origin' };
  contentSecurityPolicy?: false;
};

/** The default import is either the function or `{ default: function }`, depending on how TypeScript resolves helmet. */
const helmet: HelmetFactory =
  (helmetModule as unknown as { default?: HelmetFactory }).default ??
  (helmetModule as unknown as HelmetFactory);

/** Accepted shape of an incoming `X-Request-Id` header. */
const REQUEST_ID = /^[\w-]{8,64}$/;

/** Config, logging, rate limiting and the global pipe / filter / interceptors. */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      // Tests must be hermetic: never pick up a developer's real `.env`.
      ignoreEnvFile: process.env['NODE_ENV'] === 'test',
    }),

    ScheduleModule.forRoot(),

    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const isProduction =
          config.get('NODE_ENV', { infer: true }) === 'production';
        const format =
          config.get('LOG_FORMAT', { infer: true }) ??
          (isProduction ? 'json' : 'pretty');
        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL', { infer: true }),
            // Correlate a request across logs and with the client via `X-Request-Id`.
            genReqId: (req, res) => {
              const incoming = req.headers['x-request-id'];
              const id =
                typeof incoming === 'string' && REQUEST_ID.test(incoming)
                  ? incoming
                  : randomUUID();
              res.setHeader('X-Request-Id', id);
              return id;
            },
            // Probes would drown out real traffic.
            autoLogging: {
              ignore: (req) => req.url?.includes('/health') ?? false,
            },
            customLogLevel: (_req, res, err) =>
              err || res.statusCode >= 500
                ? 'error'
                : res.statusCode >= 400
                  ? 'warn'
                  : 'info',
            // Privacy: never log query strings, headers, cookies or IPs.
            serializers: {
              req: (req: { id: string; method: string; url?: string }) => ({
                id: req.id,
                method: req.method,
                url: req.url?.split('?')[0],
              }),
              res: (res: { statusCode: number }) => ({
                statusCode: res.statusCode,
              }),
            },
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]',
              ],
              censor: '[redacted]',
            },
            transport:
              format === 'pretty'
                ? {
                    target: 'pino-pretty',
                    options: {
                      singleLine: true,
                      translateTime: 'HH:MM:ss.l',
                      ignore: 'pid,hostname',
                    },
                  }
                : undefined,
          },
        };
      },
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          {
            ttl: config.get('THROTTLE_TTL_MS', { infer: true }),
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
          },
        ],
        skipIf: () => !config.get('THROTTLE_ENABLED', { infer: true }),
      }),
    }),
  ],
  providers: [
    { provide: APP_PIPE, useFactory: createValidationPipe },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_INTERCEPTOR, useClass: LocationInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class CoreModule implements NestModule {
  constructor(private readonly config: ConfigService<Env, true>) {}

  /** Applies helmet, compression and cookie parsing to every route. */
  configure(consumer: MiddlewareConsumer): void {
    const isProduction =
      this.config.get('NODE_ENV', { infer: true }) === 'production';
    const swaggerEnabled =
      this.config.get('SWAGGER_ENABLED', { infer: true }) ?? !isProduction;
    consumer
      .apply(
        helmet({
          // The frontend loads our responses cross-origin; the default `same-origin` would block them.
          crossOriginResourcePolicy: { policy: 'cross-origin' },
          // Swagger UI needs inline scripts; the API itself serves JSON only.
          contentSecurityPolicy: swaggerEnabled ? false : undefined,
        }),
        compression(),
        cookieParser(),
      )
      .forRoutes('*');
  }
}
