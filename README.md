# TaskForge API

NestJS 12 + Prisma 7 + PostgreSQL backend implementing every endpoint in [`BACKEND_API.md`](./BACKEND_API.md)
(42 REST endpoints). Design background: [`BACKEND_PLAN.md`](./BACKEND_PLAN.md).

## Prerequisites

- **Node.js 22** (see `.nvmrc`) and npm
- **PostgreSQL**, either local or hosted (Neon, Supabase, Render, ...)

## Getting started

```bash
git clone <repo-url> taskforge-server && cd taskforge-server

# 1. Install dependencies (also runs `prisma generate`)
npm install

# 2. Create your environment file
cp .env.example .env
#    then edit .env:
#      DATABASE_URL       postgresql://USER:PASSWORD@localhost:5432/task-forge
#      JWT_ACCESS_SECRET  at least 32 chars, e.g. `openssl rand -base64 48`

# 3. Create the database, then apply the migrations
createdb task-forge                    # skip if your host already gave you a database
npm run db:migrate

# 4. Load the demo data (optional, but needed to try the API with real content)
npm run db:seed

# 5. Start the API with auto-reload
npm run start:dev
```

The API is now at `http://localhost:4040/api/v1`. All routes live under `/api/v1`.

> `npm run db:seed` first **deletes** all existing rows in the app tables, so only run it on a development database.

### Check that it works

1. **Health:** `curl http://localhost:4040/api/v1/health` returns the service status; `/api/v1/health/ready` adds the individual checks (database).
2. **Swagger UI:** open `http://localhost:4040/api/docs` and try endpoints in the browser (OpenAPI JSON at `/api/docs-json`, importable into Postman).
3. **Log in as a seeded user:**

   ```bash
   curl -X POST http://localhost:4040/api/v1/auth/login \
     -H 'Content-Type: application/json' \
     -d '{"email":"owner@demo.dev","password":"Demo1234!"}'
   ```

   The response contains an `accessToken`. Send it as `Authorization: Bearer <accessToken>` to call protected endpoints, e.g. `GET /api/v1/projects`.
4. **Postman:** import `api-collection.json` (its `baseUrl` variable defaults to `http://localhost:4040`).

### Demo accounts (after `npm run db:seed`)

Password for all of them: `Demo1234!`

| Email | Role in "Website Redesign" |
| --- | --- |
| `owner@demo.dev` | OWNER |
| `admin@demo.dev` | ADMIN |
| `member@demo.dev` | MEMBER |
| `diego@demo.dev`, `sara@demo.dev` | MEMBER |
| `liam@demo.dev` | MEMBER of "Mobile App v2" |

The seed creates 6 users, 4 projects, 43 tasks, 35 comments and more; see [`prisma/README.md`](./prisma/README.md).

## Environment

All variables are validated at boot by `src/core/env.validation.ts` (the app refuses to start on an invalid value); `.env.example` lists every option with comments.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | PostgreSQL connection string (`DB_SSL=true` to verify the server certificate) |
| `JWT_ACCESS_SECRET` | yes | access-token signing secret, at least 32 characters |
| `FRONTEND_ORIGIN` | in production | comma-separated allowed frontend origins (credentials enabled) |
| `PORT` | no | HTTP port, default `4040` |
| `COOKIE_SAMESITE` / `COOKIE_SECURE` / `COOKIE_DOMAIN` | no | refresh-cookie flags (`none` needed for a frontend on another domain) |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run start:dev` | start with auto-reload |
| `npm run build` | compile to `dist/` |
| `npm run start:prod` | run the compiled build (`dist/src/main.js`) |
| `npm run db:migrate` | apply database migrations |
| `npm run db:seed` | load demo data (deletes existing rows first) |
| `npm run lint` · `npm run typecheck` | static checks |
| `npm run format` · `npm run format:check` | Prettier |

## Project structure

```
src/
  auth/ users/ projects/ members/ tasks/ labels/ comments/
  dashboard/ notifications/ activity/ health/   feature modules (controller -> service -> Prisma)
  common/    shared decorators, DTOs, filters, interceptors, utils
  core/      config validation, Swagger setup
  prisma/    Prisma service and database adapter
prisma/
  schemas/   Prisma models
  migrations/  SQL migrations
  seed.ts    demo data
```

Documentation: [`BACKEND_API.md`](./BACKEND_API.md) (API contract), [`BACKEND_PLAN.md`](./BACKEND_PLAN.md) (design background), [`prisma/README.md`](./prisma/README.md) (database).

## Design decisions

| Decision | Why |
| --- | --- |
| Modular monolith (one Nest module per feature, controller -> service -> Prisma) | Simple to run and reason about; module boundaries still allow splitting later. Controllers only parse and delegate. |
| Explicit `ProjectMember` table with a `role` (not an implicit many-to-many) | Membership carries data (role, joinedAt) and every authorization check becomes one indexed lookup. |
| `404` (not `403`) for non-members and for unknown projects | Outsiders cannot learn that a project exists. Role failures inside a project are `403`. |
| Project-scoped queries (`where: { id, projectId }`) as the IDOR defence | Guessing an ID from another project cannot leak or modify data; the guard alone is not trusted. |
| Permission rules as pure functions (`projects/project-permissions.ts`) | One readable place for the permission matrix. |
| argon2id + short JWT access token + rotating opaque refresh token in an HttpOnly cookie | Access tokens stay out of storage; replaying a rotated refresh token revokes every session of that user. |
| Float `position` with midpoint insertion (renumber when the gap closes) | A drag-and-drop move updates one row instead of re-indexing a column. |
| Stable error `code` + field `details` on every error | The frontend can map errors to form fields without parsing messages. |

## Trade-offs and deferred work

- **No real-time updates.** The API is REST only; live updates (e.g. WebSockets) are not implemented.
- **No Redis / caching.** Dashboard queries are a handful of indexed `count`/`groupBy` calls, so caching would add moving parts without measured need. Rate limiting is therefore in-memory.
- **Hard delete + cascade** (as the API contract specifies) instead of soft delete.
- **Account deletion anonymises** the user, so tasks and comments keep a valid author reference.
- **Not built:** email delivery, attachments, OAuth, multi-workspace support.

## Known limits

- Password-reset email is not sent (no mail provider): the reset link is written to the server log.
- `DELETE /auth/profile` anonymises the account (tasks/comments keep their author reference); it is refused while the user owns projects that have other members.
- Rate limiting is in-memory (single instance); use a Redis store when scaling out.

## Deploying

- **Database:** use a hosted PostgreSQL: Neon or Supabase (free tiers, no expiry) or Render Postgres (free tier expires after 30 days). Put its connection string in `DATABASE_URL` (add `?sslmode=require` if the host needs it).
- **API on Render (Web Service):** build `npm install && npm run build`, start `npm run db:migrate && npm run start:prod`.
- **Env vars:** `DATABASE_URL`, `JWT_ACCESS_SECRET` (long random), `NODE_ENV=production`, `FRONTEND_ORIGIN` (your frontend URL).
- Cross-site cookies: if frontend and API are on different domains, set `COOKIE_SAMESITE=none` (Secure is then required and is on by default in production).
