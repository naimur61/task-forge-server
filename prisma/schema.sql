-- TaskForge — PostgreSQL schema
--
-- Mirrors the in-memory row shapes in src/mocks/db.ts so the same demo
-- data can be loaded into Postgres for the backend. Column names are
-- snake_case (Postgres convention) but the values in seed.sql are exactly
-- the same data as src/mocks/data/*.json.
--
-- This file is idempotent: every CREATE is guarded so it can be re-run.
-- The DDL is in dependency-safe order (parents before children).

-- ---------- Enums ---------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE project_status AS ENUM ('ACTIVE', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE member_role    AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_status    AS ENUM ('TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE task_priority  AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Tables --------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  name        TEXT        NOT NULL,
  email       TEXT        NOT NULL UNIQUE,
  password    TEXT        NOT NULL,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT           NOT NULL,
  description TEXT,
  status      project_status NOT NULL,
  owner_id    TEXT           NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ    NOT NULL,
  updated_at  TIMESTAMPTZ    NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id         TEXT PRIMARY KEY,
  project_id TEXT        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    TEXT        NOT NULL REFERENCES users(id),
  role       member_role NOT NULL,
  joined_at  TIMESTAMPTZ NOT NULL,
  UNIQUE (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS labels (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  project_id   TEXT          NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title        TEXT          NOT NULL,
  description  TEXT,
  status       task_status   NOT NULL,
  priority     task_priority NOT NULL,
  position     INTEGER       NOT NULL,
  due_date     TIMESTAMPTZ,
  assignee_id  TEXT REFERENCES users(id),
  creator_id   TEXT          NOT NULL REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ   NOT NULL,
  updated_at   TIMESTAMPTZ   NOT NULL
);

-- Many-to-many for the array-shaped label list on each task.
CREATE TABLE IF NOT EXISTS task_labels (
  task_id  TEXT NOT NULL REFERENCES tasks(id)  ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, label_id)
);

CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,
  task_id    TEXT        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id  TEXT        NOT NULL REFERENCES users(id),
  body       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS activity (
  id         TEXT PRIMARY KEY,
  project_id TEXT        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_id   TEXT        NOT NULL REFERENCES users(id),
  action     TEXT        NOT NULL,
  message    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT        NOT NULL REFERENCES users(id),
  type       TEXT        NOT NULL,
  message    TEXT        NOT NULL,
  link       TEXT,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);

-- ---------- Indexes -------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_projects_owner            ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_members_user              ON members(user_id);
CREATE INDEX IF NOT EXISTS idx_members_project           ON members(project_id);
CREATE INDEX IF NOT EXISTS idx_labels_project            ON labels(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project             ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee            ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_status      ON tasks(project_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_project_position    ON tasks(project_id, status, position);
CREATE INDEX IF NOT EXISTS idx_task_labels_label         ON task_labels(label_id);
CREATE INDEX IF NOT EXISTS idx_comments_task             ON comments(task_id);
CREATE INDEX IF NOT EXISTS idx_activity_project          ON activity(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_project_created  ON activity(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user        ON notifications(user_id, created_at DESC);
