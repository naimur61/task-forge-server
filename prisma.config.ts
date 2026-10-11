import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schemas',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node --import tsx/esm prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
