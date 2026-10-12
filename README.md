# TaskForge API

NestJS 12 + Prisma 7 + PostgreSQL backend implementing every endpoint in [`BACKEND_API.md`](./BACKEND_API.md)
(42 REST endpoints + Socket.IO live updates). Design background: [`BACKEND_PLAN.md`](./BACKEND_PLAN.md).

## Quick start

```bash
cp .env.example .env                   # set DATABASE_URL and JWT_ACCESS_SECRET (>= 32 chars)
npm install                            # also runs `prisma generate`
npm run db:migrate                     # apply migrations
npm run db:seed                        # demo data (optional)
npm run start:dev                      # http://localhost:4040/api/v1
```

- Swagger UI: `http://localhost:4040/api/docs` (OpenAPI JSON at `/api/docs-json`, importable into Postman)
- Socket.IO: same port as the API (`http://localhost:4040`), auth via `auth: { token: <accessToken> }`
- Seed logins (password `Demo1234!`): `owner@demo.dev`, `admin@demo.dev`, `member@demo.dev`, `diego@demo.dev`, `sara@demo.dev`, `liam@demo.dev`

Frontend `.env.local`: `NEXT_PUBLIC_API_URL=http://localhost:4040/api/v1`, `NEXT_PUBLIC_SOCKET_URL=http://localhost:4040`.

## Environment

All variables are validated at boot by `src/core/env.validation.ts`; see `.env.example` for the full list.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (`DB_SSL=true` to verify the server certificate) |
| `JWT_ACCESS_SECRET` | access-token signing secret, at least 32 characters |
| `FRONTEND_ORIGIN` | comma-separated allowed frontend origins (credentials enabled); required in production |
| `COOKIE_SAMESITE` / `COOKIE_SECURE` / `COOKIE_DOMAIN` | refresh-cookie flags (`none` needed for a frontend on another domain) |
| `PORT` | HTTP + Socket.IO port (4000) |

## Scripts

`npm run build` · `npm run lint` · `npm run typecheck` · `npm run format` · `npm run db:seed`

## Architecture

Same layout and conventions as `master-server`; feature folders under `src/` (controller -> service -> Prisma), shared code in `src/common`, config in `src/core`, schema in `prisma/schemas`.

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

- **Realtime is called directly from services** (`RealtimeService`), not through a domain-event bus. It is less decoupled but far easier to follow at this size; an event emitter is the next step if listeners multiply.
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
- **Env vars:** `DATABASE_URL`, `JWT_ACCESS_SECRET` (long random), `NODE_ENV=production`, `FRONTEND_ORIGIN` (your frontend URL). Socket.IO shares the API port, so set `NEXT_PUBLIC_SOCKET_URL` to the API's base URL (without `/api/v1`).
- Cross-site cookies: if frontend and API are on different domains, set `COOKIE_SAMESITE=none` (Secure is then required and is on by default in production).
