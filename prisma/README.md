# TaskForge — PostgreSQL backend seed

PostgreSQL schema and seed data for the TaskForge backend. The values are
**the exact same demo data** as the Next.js demo API uses (so the frontend
and backend show the same thing), but expressed as Postgres tables with
snake_case column names.

## Files

| File | What it is |
|---|---|
| `schema.sql` | Tables, enums, foreign keys, indexes. Idempotent (safe to re-run). |
| `seed.sql`   | INSERT statements for every demo row. Also idempotent (TRUNCATEs first). |

Both files use `TIMESTAMPTZ` for every date column and PostgreSQL `ENUM`
types for `project.status`, `members.role`, `tasks.status`, `tasks.priority`.

## Loading it

```bash
createdb taskforge
psql -d taskforge -f db/postgres/schema.sql
psql -d taskforge -f db/postgres/seed.sql
```

Want to wipe and re-seed? Just re-run `seed.sql` — it `TRUNCATE`s
everything inside a transaction.

```bash
psql -d taskforge -f db/postgres/seed.sql      # safe, repeatable
```

## Demo accounts

All passwords are `Demo1234!` (plain text in the seed — hash them in your
backend before exposing the API).

| Email                | Name              | Role in "Website Redesign" |
|----------------------|-------------------|----------------------------|
| owner@demo.dev       | Ava Chen          | OWNER                      |
| admin@demo.dev       | Marcus Reed       | ADMIN                      |
| member@demo.dev      | Priya Natarajan   | MEMBER                     |
| diego@demo.dev       | Diego Alvarez     | MEMBER (Website Redesign)  |
| sara@demo.dev        | Sara Okafor       | MEMBER (Website Redesign)  |
| liam@demo.dev        | Liam Novak        | MEMBER (Mobile App v2)     |

## Data shape

| Table | Rows | Notes |
|---|---:|---|
| `users`         |   6 | |
| `projects`      |   4 | 3 ACTIVE, 1 ARCHIVED |
| `members`       |  14 | one row per (project, user) |
| `labels`        |  20 | 5 per project (Bug, Feature, Design, Docs, Chore) |
| `tasks`         |  43 | IDs `tsk_0035`…`tsk_0077` |
| `task_labels`   |  26 | join table for the array of labels on each task |
| `comments`      |  35 | |
| `activity`      |  66 | `task.created` + `task.completed` + `member.added` |
| `notifications` |   5 | |

## Regenerating `seed.sql`

If the demo data in `src/mocks/data/*.json` changes, regenerate the SQL:

```bash
npm run seed:sql
```

`scripts/build-seed-sql.mjs` reads the JSON files and writes a fresh
`seed.sql`. Same source, no drift.

## Foreign keys at a glance

```
users                          ─┐
                                ├─ projects.owner_id
                                ├─ members.user_id, project_id → projects
                                ├─ tasks.assignee_id, creator_id
                                ├─ comments.author_id
                                ├─ activity.actor_id
                                └─ notifications.user_id

projects                       ─┬─ members, labels, tasks, activity (all ON DELETE CASCADE)
                                 └─ tasks → members.user_id (assignee/creator)

tasks                          ─┬─ comments (ON DELETE CASCADE)
                                 └─ task_labels (ON DELETE CASCADE) → labels
```
