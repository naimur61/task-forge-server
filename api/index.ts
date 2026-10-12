import type { IncomingMessage, ServerResponse } from 'node:http';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApp } from '../src/app.factory.js';

/** Created once per function instance and reused by every request (one DB pool per instance). */
let ready: Promise<NestExpressApplication> | undefined;

function getApp(): Promise<NestExpressApplication> {
  ready ??= createApp()
    .then(async (app) => {
      await app.init();
      return app;
    })
    .catch((err: unknown) => {
      // Let the next request retry instead of caching a failed boot.
      ready = undefined;
      throw err;
    });
  return ready;
}

/** Vercel serverless entry: forwards the request to the cached Express app. */
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const app = await getApp();
  const express = app.getHttpAdapter().getInstance() as (
    req: IncomingMessage,
    res: ServerResponse,
  ) => void;
  express(req, res);
}
