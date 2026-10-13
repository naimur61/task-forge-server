# Database (Prisma + PostgreSQL)

| Path | What it is |
| --- | --- |
| `schemas/*.prisma` | Prisma models, one file per area (`auth`, `projects`, `tasks`, `notifications`) plus `schema.prisma` (generator + datasource). |
| `migrations/` | SQL migrations applied with `npm run db:migrate`. This is the source of truth for the database structure. |
| `seed.ts` | Demo data, run with `npm run db:seed`. |

The Prisma config is in `../prisma.config.ts`; the client is generated into `../generated/prisma` (git-ignored, created by `npm install`).

## Create the database and apply migrations

```bash
createdb task-forge                    # or create it in pgAdmin / your hosting dashboard
# .env: DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/task-forge
npm run db:migrate                     # prisma migrate deploy: applies every migration in order
```

## Load the demo data

```bash
npm run db:seed
```

The seed can be re-run, but it **first deletes all existing users, projects, tasks, comments, labels, activity and notifications**, then re-inserts the demo rows. Run it only on a development or demo database, never on one holding real data.

| Table | Rows |
| --- | ---: |
| `users` | 6 |
| `projects` | 4 (3 active, 1 archived) |
| `project_members` | 14 |
| `labels` | 20 |
| `tasks` | 43 |
| `task_labels` | 26 |
| `comments` | 35 |
| `activity` | 66 |
| `notifications` | 5 |

### Demo accounts

Every account has the password `Demo1234!`.

| Email | Name | Role in "Website Redesign" |
| --- | --- | --- |
| owner@demo.dev | Ava Chen | OWNER |
| admin@demo.dev | Marcus Reed | ADMIN |
| member@demo.dev | Priya Natarajan | MEMBER |
| diego@demo.dev | Diego Alvarez | MEMBER |
| sara@demo.dev | Sara Okafor | MEMBER |
| liam@demo.dev | Liam Novak | MEMBER (Mobile App v2) |

## Changing the schema

```bash
# 1. edit prisma/schemas/*.prisma
npx prisma migrate dev --name describe_change   # creates + applies a migration, regenerates the client
```

Commit the new folder under `prisma/migrations/`.
