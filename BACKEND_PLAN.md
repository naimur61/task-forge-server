# BACKEND PLAN: TaskForge API (NestJS + PostgreSQL)

> Portfolio-grade Project & Task Management backend. Covers every requirement of the assignment brief and extends it with real-time updates, kanban ordering, comments, notifications, caching and hardened security.

---

## 1. Goals & Requirement Traceability

| # | Brief requirement | Where it is delivered | Priority |
|---|---|---|---|
| 1 | User registration & login (JWT) | `auth` module: `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` | Core |
| 2 | Create projects | `projects` module: `POST /projects` | Core |
| 3 | Add registered users as project members | `members` module: `POST /projects/:id/members` + `GET /users/search` | Core |
| 4 | Projects have multiple tasks | `tasks` module, FK `Task.projectId` | Core |
| 5 | Assign tasks to project members | `Task.assigneeId`, validated against `ProjectMember` | Core |
| 6 | Task fields: title, description, status, priority, assignee, due date | `Task` model + DTOs | Core |
| 7 | Statuses Todo / In Progress / Done | `TaskStatus` enum (+ `IN_REVIEW` as a bonus) | Core |
| 8 | Search, filter, sort, pagination on task list | `GET /projects/:id/tasks` query DTO | Core |
| 9 | Owner vs member permissions | Role-based guards + permission matrix (section 6) | Core |
| 10 | No cross-project access by changing IDs (IDOR) | `ProjectMemberGuard` + scoped queries (section 6) | Core |
| 11 | Dashboard: total/active projects, total/completed/high-priority tasks | `dashboard` module | Core |
| 12 | Tests | Jest unit + Supertest e2e (section 12) | Core |
| 13 | Swagger/Postman docs | `/api/docs` + exported Postman collection | Core |
| 14 | Git repo, README, migrations, seed data | Submission checklist (section 15) | Core |
| 15 | Real-time updates, notifications | Socket.IO gateway + `Notification` model | Bonus |
| 16 | Kanban ordering, comments, labels, attachments | `position`, `Comment`, `Label`, `Attachment` | Bonus |
| 17 | Refresh-token rotation, rate limiting, Helmet, audit log | Security section | Bonus |
| 18 | Docker, CI, e2e | DevOps section | Bonus |

**Review criteria A–G map to:** A structure (sec 3), B DTOs (sec 9), C auth/authz (sec 5–6), D errors (sec 9), E API design (sec 7), F business logic separation (sec 3), G DB design (sec 4).

---

## 2. Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | NestJS 10+ (TypeScript, `strict: true`) | Modules, DI, guards |
| DB | PostgreSQL 16 | Relational integrity, trigram search |
| ORM | Prisma | Type safety, migrations, seed |
| Cache / rate limit / pub-sub | Redis 7 | Dashboard cache, throttler store, socket adapter |
| Auth | `@nestjs/jwt`, `passport-jwt`, argon2 | Standard, secure |
| Validation | `class-validator`, `class-transformer` | DTO-based |
| Docs | `@nestjs/swagger` | OpenAPI at `/api/docs` |
| Real-time | `@nestjs/websockets` + Socket.IO | Live board updates |
| Logging | `nestjs-pino` | Structured, fast |
| Security | `helmet`, `@nestjs/throttler`, CORS allowlist | Hardening |
| Config | `@nestjs/config` + Zod/Joi env validation | Fail fast on bad env |
| Testing | Jest, Supertest, Testcontainers or Docker test DB | Real DB e2e |
| Tooling | ESLint, Prettier, Husky, lint-staged, commitlint | Code quality |

---

## 3. Architecture

Modular monolith. Strict layering:

```
Controller  ->  Service (business rules)  ->  Prisma (data access)
   |              |
 DTO/Swagger   Policies, events, transactions
```

- **Controllers**: HTTP only (parse, delegate, shape response). No business logic.
- **Services**: all business rules, authorization-by-data checks, transactions, event emission.
- **Policies** (`*.policy.ts`): pure functions answering "can role X do action Y", unit-testable.
- **Events**: services emit domain events (`EventEmitter2`); `notifications`, `activity` and the WebSocket gateway listen. This keeps modules decoupled.

### Folder structure

```
backend/
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
├─ src/
│  ├─ main.ts
│  ├─ app.module.ts
│  ├─ config/                # env schema, typed config
│  ├─ prisma/                # PrismaModule, PrismaService
│  ├─ redis/                 # RedisModule, cache helper
│  ├─ common/
│  │  ├─ decorators/         # @CurrentUser, @ProjectRoles, @Public
│  │  ├─ guards/             # JwtAuthGuard, ProjectMemberGuard, ProjectRolesGuard
│  │  ├─ filters/            # AllExceptionsFilter, PrismaExceptionMapper
│  │  ├─ interceptors/       # Logging, Transform (envelope), Timeout
│  │  ├─ pipes/              # ParseUuidPipe config
│  │  ├─ dto/                # PaginationQueryDto, PaginatedResponse
│  │  └─ utils/
│  ├─ modules/
│  │  ├─ auth/
│  │  ├─ users/
│  │  ├─ projects/
│  │  ├─ members/
│  │  ├─ tasks/
│  │  ├─ comments/
│  │  ├─ labels/
│  │  ├─ attachments/
│  │  ├─ dashboard/
│  │  ├─ notifications/
│  │  ├─ activity/
│  │  ├─ realtime/           # Socket.IO gateway
│  │  └─ health/
│  └─ events/                # event names + payload types
├─ test/                     # e2e specs
├─ docker/ , Dockerfile , docker-compose.yml
├─ .env.example
└─ README.md
```

Each feature module: `x.module.ts`, `x.controller.ts`, `x.service.ts`, `x.policy.ts`, `dto/`, `x.service.spec.ts`.

---

## 4. Database Design

### Entity relationships

```
User 1───* ProjectMember *───1 Project
User 1───* Project (owner)
Project 1───* Task
User 1───* Task (assignee, nullable)
User 1───* Task (creator)
Task 1───* Comment *───1 User
Task *───* Label (via TaskLabel), Label belongs to Project
Task 1───* Attachment
User 1───* Notification
Project 1───* ActivityLog
User 1───* RefreshToken
```

**Key design decision:** `ProjectMember` is an explicit join table (not an implicit M:N) because it carries a **role** and `joinedAt`. The project owner is stored both as `Project.ownerId` and as a `ProjectMember` row with role `OWNER`. This makes every membership check a single indexed lookup.

### Prisma schema (sketch)

```prisma
enum ProjectStatus { ACTIVE ARCHIVED }
enum MemberRole    { OWNER ADMIN MEMBER }
enum TaskStatus    { TODO IN_PROGRESS IN_REVIEW DONE }
enum TaskPriority  { LOW MEDIUM HIGH URGENT }

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  name         String
  passwordHash String
  avatarUrl    String?
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  ownedProjects  Project[]       @relation("ProjectOwner")
  memberships    ProjectMember[]
  assignedTasks  Task[]          @relation("TaskAssignee")
  createdTasks   Task[]          @relation("TaskCreator")
  comments       Comment[]
  notifications  Notification[]
  refreshTokens  RefreshToken[]
}

model Project {
  id          String        @id @default(uuid())
  name        String
  description String?
  status      ProjectStatus @default(ACTIVE)
  ownerId     String
  deletedAt   DateTime?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  owner    User            @relation("ProjectOwner", fields: [ownerId], references: [id])
  members  ProjectMember[]
  tasks    Task[]
  labels   Label[]
  activity ActivityLog[]

  @@index([ownerId])
  @@index([status, deletedAt])
}

model ProjectMember {
  id        String     @id @default(uuid())
  projectId String
  userId    String
  role      MemberRole @default(MEMBER)
  joinedAt  DateTime   @default(now())

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([projectId, userId])
  @@index([userId])
}

model Task {
  id          String       @id @default(uuid())
  projectId   String
  title       String
  description String?
  status      TaskStatus   @default(TODO)
  priority    TaskPriority @default(MEDIUM)
  position    Float        @default(0)        // kanban ordering (fractional indexing)
  dueDate     DateTime?
  assigneeId  String?
  creatorId   String
  completedAt DateTime?
  deletedAt   DateTime?
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  project  Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  assignee User?   @relation("TaskAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)
  creator  User    @relation("TaskCreator", fields: [creatorId], references: [id])
  comments Comment[]
  labels   TaskLabel[]
  attachments Attachment[]

  @@index([projectId, status, position])
  @@index([projectId, assigneeId])
  @@index([projectId, dueDate])
  @@index([projectId, priority])
}

model Comment    { id String @id @default(uuid()) taskId String authorId String body String createdAt DateTime @default(now()) updatedAt DateTime @updatedAt /* relations, @@index([taskId, createdAt]) */ }
model Label      { id String @id @default(uuid()) projectId String name String color String /* @@unique([projectId, name]) */ }
model TaskLabel  { taskId String labelId String @@id([taskId, labelId]) }
model Attachment { id String @id @default(uuid()) taskId String uploaderId String fileName String mimeType String size Int storageKey String createdAt DateTime @default(now()) }
model Notification { id String @id @default(uuid()) userId String type String payload Json readAt DateTime? createdAt DateTime @default(now()) /* @@index([userId, readAt, createdAt]) */ }
model ActivityLog  { id String @id @default(uuid()) projectId String actorId String action String entity String entityId String meta Json? createdAt DateTime @default(now()) /* @@index([projectId, createdAt]) */ }
model RefreshToken { id String @id @default(uuid()) userId String tokenHash String @unique familyId String expiresAt DateTime revokedAt DateTime? createdAt DateTime @default(now()) /* @@index([userId, familyId]) */ }
```

(The compact models above are expanded to full relations in the real `schema.prisma`.)

### Design notes
- **UUIDs** as IDs (not guessable sequential IDs; reduces enumeration risk, though authz is the real defense).
- **Soft delete** (`deletedAt`) for projects and tasks, with a Prisma extension or service-level filter so deleted rows never leak.
- **Search:** `pg_trgm` GIN index on `Task.title` (and description) via a raw SQL migration for fast `ILIKE` search.
- **Integrity:** DB-level FKs and unique constraints. Assignee membership is enforced in the service inside the same transaction as the write.
- **Kanban ordering:** `position` as a float using fractional indexing (insert between neighbors, rebalance when gaps shrink).
- **Migrations + seed:** `prisma migrate` with a committed migrations folder. `seed.ts` creates 5 demo users, 3 projects with mixed roles, ~200 tasks across statuses and priorities, comments, labels. A documented demo login.

---

## 5. Authentication & Security

### Auth flow
1. `POST /auth/register`: validates input, normalizes email to lowercase, hashes password with **argon2id**, returns user + tokens.
2. `POST /auth/login`: generic "invalid credentials" error (no user enumeration), constant-time compare, lockout/throttle on repeated failures.
3. **Access token:** JWT, 15 min, signed with a strong secret from env, payload `{ sub, email }` only.
4. **Refresh token:** opaque random value, 7–30 days, stored **hashed** in DB, sent as `httpOnly; Secure; SameSite=Lax` cookie. **Rotation:** each refresh issues a new token and revokes the old one. **Reuse detection:** presenting a revoked token revokes the whole `familyId`.
5. `POST /auth/logout`: revokes the current refresh token. `POST /auth/logout-all`: revokes the user's tokens.
6. `GET /auth/me`.

### Hardening checklist (OWASP-aligned)
- `helmet()` headers, strict CORS allowlist from env, `credentials: true` only for known origins.
- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`: blocks mass assignment.
- Rate limiting via `@nestjs/throttler` with Redis storage: global limit, stricter on `/auth/*`.
- Body size limit, request timeout interceptor, compression.
- Prisma parameterized queries (no raw string concatenation; raw SQL only with `Prisma.sql`).
- Passwords never logged or returned (response DTOs with `@Exclude`/explicit mapping).
- Secrets only in env, validated at startup. `.env.example` committed, `.env` ignored.
- Dependency audit in CI (`npm audit`), Dependabot.
- Audit trail: `ActivityLog` for sensitive actions (member added/removed, role changed, project deleted).
- Uniform error messages that avoid leaking internals (stack traces off in production).

---

## 6. Authorization Design (key evaluation area)

### Layers
1. `JwtAuthGuard` (global, with `@Public()` opt-out): authenticates the user.
2. `ProjectMemberGuard`: for routes with `:projectId`, looks up `ProjectMember(projectId, userId)`; attaches `req.membership`. **If not a member, respond 404** (not 403), so outsiders can't confirm a project exists.
3. `ProjectRolesGuard` + `@ProjectRoles(MemberRole.OWNER, ...)`: checks `req.membership.role`.
4. **Resource scoping in services (the real IDOR defense):** never fetch by bare ID. Always query `where: { id: taskId, projectId }`. A task ID from project B used under project A's URL returns 404.
5. Policies (`tasks.policy.ts`) for finer rules, such as "members can edit only tasks they created or are assigned to".

### Permission matrix

| Action | Owner | Admin | Member | Non-member |
|---|:-:|:-:|:-:|:-:|
| View project, tasks, comments | ✅ | ✅ | ✅ | ❌ (404) |
| Edit project name/description | ✅ | ✅ | ❌ | ❌ |
| Archive / delete project | ✅ | ❌ | ❌ | ❌ |
| Add / remove members | ✅ | ✅ (not owner/admin) | ❌ | ❌ |
| Change member role | ✅ | ❌ | ❌ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ | ❌ |
| Leave project | ❌ (must transfer first) | ✅ | ✅ | n/a |
| Create task | ✅ | ✅ | ✅ | ❌ |
| Edit any task | ✅ | ✅ | ❌ | ❌ |
| Edit own/assigned task (status, fields) | ✅ | ✅ | ✅ | ❌ |
| Delete task | ✅ | ✅ | own created only | ❌ |
| Assign task | ✅ | ✅ | self-assign / own task | ❌ |
| Comment | ✅ | ✅ | ✅ | ❌ |
| Delete comment | ✅ | ✅ | own only | ❌ |
| Manage labels | ✅ | ✅ | ❌ | ❌ |

### Business invariants
- Assignee must be a current project member (validated in the same transaction).
- Removing a member **unassigns** their tasks (`assigneeId = null`) and emits an event.
- Owner cannot be removed or demoted; ownership transfer is explicit and atomic.
- Cannot add the same user twice (unique constraint, mapped to 409).
- Archived projects are read-only for tasks.

### Authorization test cases (must exist in e2e)
- Outsider `GET /projects/:id` → 404.
- User A reads Task from Project B via `/projects/A/tasks/:taskB` → 404.
- Member `DELETE /projects/:id` → 403.
- Member adds member → 403.
- Assign task to a non-member → 422.
- Expired/forged/missing JWT → 401.
- Mass-assignment attempt (`role`, `ownerId` in body) → 400.

---

## 7. API Design

- Base path `/api/v1`, REST, JSON, plural nouns, nested only one level deep for project-scoped resources.
- Consistent **success envelope:** `{ "data": ..., "meta": { ... } }`.
- Consistent **error format** (RFC 7807-inspired):
  ```json
  { "statusCode": 422, "error": "Unprocessable Entity", "message": "Assignee is not a project member",
    "code": "ASSIGNEE_NOT_MEMBER", "details": [], "path": "/api/v1/...", "requestId": "..." }
  ```
- Status codes: 200, 201, 204, 400 (validation), 401, 403, 404, 409 (conflict), 422 (business rule), 429.

### Endpoints

**Auth**
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | public |
| POST | `/auth/login` | public, throttled |
| POST | `/auth/refresh` | cookie, rotation |
| POST | `/auth/logout` | revoke current |
| GET | `/auth/me` | current user |

**Users**
| GET | `/users/search?q=` | find registered users to add (min 2 chars, limited fields, throttled) |
| PATCH | `/users/me` | update profile |
| PATCH | `/users/me/password` | change password, revokes refresh tokens |

**Projects**
| GET | `/projects` | mine, with `search`, `status`, pagination |
| POST | `/projects` | creator becomes OWNER |
| GET | `/projects/:projectId` | member |
| PATCH | `/projects/:projectId` | owner/admin |
| POST | `/projects/:projectId/archive` , `/restore` | owner |
| DELETE | `/projects/:projectId` | owner (soft delete) |

**Members**
| GET | `/projects/:projectId/members` | member |
| POST | `/projects/:projectId/members` | `{ userId or email, role }` owner/admin |
| PATCH | `/projects/:projectId/members/:userId` | change role, owner only |
| DELETE | `/projects/:projectId/members/:userId` | remove/leave |
| POST | `/projects/:projectId/transfer-ownership` | owner |

**Tasks**
| GET | `/projects/:projectId/tasks` | search/filter/sort/paginate |
| POST | `/projects/:projectId/tasks` | |
| GET | `/projects/:projectId/tasks/:taskId` | |
| PATCH | `/projects/:projectId/tasks/:taskId` | partial update |
| PATCH | `/projects/:projectId/tasks/:taskId/move` | `{ status, beforeId?, afterId? }` kanban |
| DELETE | `/projects/:projectId/tasks/:taskId` | |
| GET | `/projects/:projectId/board` | tasks grouped by status |

**Comments / Labels / Attachments**
| GET, POST | `/projects/:projectId/tasks/:taskId/comments` | |
| PATCH, DELETE | `/projects/:projectId/tasks/:taskId/comments/:commentId` | |
| GET, POST, PATCH, DELETE | `/projects/:projectId/labels[/:labelId]` | |
| PUT | `/projects/:projectId/tasks/:taskId/labels` | set labels |
| POST, DELETE | `/projects/:projectId/tasks/:taskId/attachments[/:id]` | multipart, type/size limited |

**Dashboard / Notifications / Activity / Health**
| GET | `/dashboard/summary` | cross-project overview for current user |
| GET | `/dashboard/my-tasks` | assigned to me |
| GET | `/projects/:projectId/dashboard` | per-project stats |
| GET | `/projects/:projectId/activity` | paginated |
| GET | `/notifications` , PATCH `/notifications/:id/read` , POST `/notifications/read-all` | |
| GET | `/health` , `/health/ready` | liveness / DB + Redis readiness |

### Task list query (`GET /projects/:projectId/tasks`)

| Param | Type | Example |
|---|---|---|
| `search` | string | `login bug` (title + description, trigram) |
| `status` | enum[] | `status=TODO&status=IN_PROGRESS` |
| `priority` | enum[] | `priority=HIGH,URGENT` |
| `assigneeId` | uuid or `me` or `unassigned` | |
| `labelId` | uuid[] | |
| `dueFrom`, `dueTo` | ISO date | |
| `overdue` | boolean | |
| `sortBy` | `createdAt\|dueDate\|priority\|title\|updatedAt` | whitelist only |
| `order` | `asc\|desc` | |
| `page`, `limit` | int | `limit` max 100 |

Response: `{ data: [...], meta: { page, limit, total, totalPages, hasNext, hasPrev } }`.
`sortBy` is whitelisted in the DTO (no arbitrary column injection). Priority sort uses an explicit enum order mapping.

---

## 8. Dashboard

`GET /dashboard/summary` returns, scoped to projects the user is a member of:

```json
{
  "projects": { "total": 8, "active": 6, "archived": 2 },
  "tasks": { "total": 142, "completed": 61, "inProgress": 30, "overdue": 9, "highPriority": 17, "assignedToMe": 22 },
  "byStatus":   [{ "status": "TODO", "count": 51 }],
  "byPriority": [{ "priority": "HIGH", "count": 12 }],
  "completionTrend": [{ "date": "2026-10-01", "completed": 4 }],
  "recentActivity": []
}
```

- Implemented with Prisma `groupBy`/`count` in parallel (`Promise.all`), no per-row loops.
- Cached in Redis per user (TTL 30–60s). Invalidated by domain events on task/project/member changes.
- "High priority" = `HIGH` + `URGENT` and not `DONE` (documented in Swagger).

---

## 9. Cross-Cutting Concerns

- **DTOs:** one request DTO per operation (`CreateTaskDto`, `UpdateTaskDto = PartialType(...)`), explicit response DTOs. `@ApiProperty` on everything for Swagger.
- **Validation:** `IsUUID`, `IsEnum`, `Length`, `IsISO8601`, custom `IsFutureOrToday` if needed; trim strings; email normalization.
- **Global exception filter:** maps Nest `HttpException`, validation errors (flattened `details`), and **Prisma errors** (`P2002`→409, `P2025`→404, `P2003`→409/422) into the standard error format; unknown errors → 500 with a request ID, details logged server-side only.
- **Domain exceptions:** custom classes (`AssigneeNotMemberException`, `OwnerCannotLeaveException`) carrying a stable `code`.
- **Transactions:** `prisma.$transaction` for multi-step writes (create project + owner membership, remove member + unassign tasks, ownership transfer, move task).
- **Logging:** `nestjs-pino`, request ID per request (header `x-request-id`), redact `authorization`/`cookie`/`password`.
- **Config:** typed `ConfigService`, schema-validated env at boot.
- **Pagination helper:** shared `paginate()` util returning data + meta.

---

## 10. Real-time & Notifications

- Socket.IO gateway at `/realtime`; JWT verified in the handshake; client joins `project:{id}` rooms **only after a membership check** (same authz rule as REST).
- Redis adapter so multiple API instances can broadcast.
- Events: `task.created`, `task.updated`, `task.moved`, `task.deleted`, `comment.added`, `member.added`, `member.removed`.
- Notification triggers: assigned a task, mentioned/commented on your task, added to a project, task due within 24h (scheduled job via `@nestjs/schedule`).
- Notifications are persisted (`Notification` table) and pushed live to `user:{id}` room. Endpoints for list / mark read / read-all.
- Domain event bus (EventEmitter2) decouples services from the gateway/notification/activity listeners.

---

## 11. Performance

- Indexes designed around the real query shapes (section 4); verify with `EXPLAIN ANALYZE` on seeded 10k+ tasks and record results in the README.
- No N+1: explicit `select`/`include` only for needed fields; list endpoints return slim DTOs.
- Pagination caps (`limit ≤ 100`), cursor pagination option for the activity feed.
- Redis caching for dashboard and membership lookups (short TTL, invalidated on member change).
- `compression`, Prisma connection pooling, keep-alive.
- Optional k6 script with a target (for example p95 < 150 ms for task list at 10k tasks) reported in the README.

---

## 12. Testing Strategy

| Level | Scope | Tools |
|---|---|---|
| Unit | services (business rules), policies, pagination helper, token rotation | Jest with mocked Prisma |
| e2e | Auth flow, full authz matrix, IDOR cases, task list filters/sort/pagination, dashboard numbers, error format | Supertest + real Postgres (Docker/Testcontainers), migrated and seeded per run |
| Contract | Swagger JSON snapshot stays stable | Jest snapshot |
| Load (optional) | task list, dashboard | k6 |

Targets: ≥80% coverage on services and guards; every row of the permission matrix has an e2e test.

---

## 13. DevOps

- **Dockerfile:** multi-stage (build, then slim runtime), non-root user, `prisma migrate deploy` on start.
- **docker-compose.yml:** `api`, `postgres`, `redis`, optional `pgadmin`. One command: `docker compose up`.
- **CI (GitHub Actions):** install → lint → typecheck → unit → e2e (service containers) → build → `npm audit`.
- **Env:** `.env.example` documenting every variable (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `REDIS_URL`, `CORS_ORIGINS`, `COOKIE_DOMAIN`, ...).
- **Deploy notes:** Railway/Render/Fly + Neon/Supabase Postgres + Upstash Redis.

---

## 14. Milestones

### Core path (mirrors the 5-day assignment, do this first)
| Day | Deliverable |
|---|---|
| 1 | Project scaffold, Docker Compose, config, Prisma schema + first migration, seed, health endpoint |
| 2 | Auth (register/login/refresh/logout/me), global validation + exception filter + response envelope |
| 3 | Projects + members + authorization guards/policies, permission matrix tests |
| 4 | Tasks CRUD with search/filter/sort/pagination, assignee rules, dashboard summary |
| 5 | Swagger polish, Postman export, unit + e2e tests, README, CI |

### Stretch phases (portfolio differentiators)
1. Kanban `move` endpoint + fractional ordering + board endpoint
2. Comments, labels, activity log
3. Redis caching + throttler store
4. Socket.IO real-time + notifications + due-soon scheduler
5. Attachments (S3-compatible or local volume), refresh-token reuse detection hardening
6. Load test and performance report

### Intentionally deferred (document these in the README with reasoning)
- Email verification / password reset (needs mail provider; noted as next step)
- OAuth social login
- Multi-tenant organizations/workspaces
- Full-text search engine (trigram is sufficient at this scale)

---

## 15. Submission / README Checklist

- [ ] Git repo with clean, conventional commit history
- [ ] README: overview, architecture diagram, ERD, setup in under 5 commands, env table, seed credentials, how to run tests
- [ ] **Design decisions section:** why modular monolith, why explicit `ProjectMember`, why 404 for non-members, why argon2, why fractional ordering
- [ ] **Trade-offs & deferred work** with reasoning
- [ ] Migrations committed + seed script (`npm run db:seed`)
- [ ] Swagger at `/api/docs` with auth button and examples; `postman_collection.json` exported
- [ ] Test report / coverage badge
- [ ] Security notes (threat model summary, IDOR strategy)
