# TaskForge – Backend API Specification

This file is the contract between the TaskForge frontend and the backend.
Build the backend to match it and the frontend works with **no changes** other than setting `NEXT_PUBLIC_API_URL`.

It was written from the frontend code. The working reference is the mock API in `src/mocks/routes/*`, and the types are in `src/types/*`. If this file and the mock disagree, the mock is what the app was tested against.

- [1. Conventions](#1-conventions)
- [2. Data types](#2-data-types)
- [3. Endpoint summary](#3-endpoint-summary-42-endpoints)
- [4. Endpoint details](#4-endpoint-details)
- [5. Permissions](#5-permissions)
- [6. Real-time (Socket.io)](#6-real-time-socketio)
- [7. Business rules checklist](#7-business-rules-checklist)
- [8. Suggested database tables](#8-suggested-database-tables)

---

## 1. Conventions

### Base URL

```
NEXT_PUBLIC_API_URL=http://localhost:4040/api/v1
```

All paths below are relative to it. Request and response bodies are JSON (`Content-Type: application/json`).

### Authentication

| Item | Value |
| --- | --- |
| Access token | JWT, short lived (mock uses 15 min). Sent as `Authorization: Bearer <token>`. The frontend keeps it in memory only. |
| Refresh token | **HttpOnly cookie**, set by the server on login/register/refresh (mock uses 7 days, `SameSite=Lax`). |
| On `401` | The frontend calls `POST /auth/refresh` once, then retries the request. If refresh fails, the user is sent to `/login`. |
| CORS | Must allow the frontend origin **with credentials** (`Access-Control-Allow-Credentials: true`). |

Public routes (no token): `login`, `register`, `refresh`, `logout`, `forgot-password`, `reset-password`. Everything else needs a valid access token, otherwise return `401`.

### Success response envelope

Every endpoint **except the `/auth/*` ones** returns:

```json
{ "data": <object | array>, "meta": { ... } }
```

- `meta` is present only on paginated lists.
- A `204 No Content` response has **no body**.
- `/auth/*` endpoints return plain JSON **without** the `data` wrapper (see section 4.1).

### Pagination

Paginated lists accept `?page=1&limit=10`.

- `page` defaults to 1. `limit` defaults to 10, minimum 1, maximum 100.
- If `page` is past the last page, return the last page.

```json
"meta": {
  "page": 1, "limit": 10, "total": 42, "totalPages": 5,
  "hasNext": true, "hasPrev": false
}
```

### Error response

Every 4xx/5xx returns this body (the frontend shows `message` and maps `details[].field` onto form fields):

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Name must be at least 2 characters",
  "code": "VALIDATION_ERROR",
  "details": [{ "field": "name", "message": "Name must be at least 2 characters" }]
}
```

`details` is always an array (empty when there is no field error).

Every error body also carries debugging context (added fields, existing ones are unchanged):

| Field | Meaning |
| --- | --- |
| `requestId` | Same value as the `X-Request-Id` header and the server log line; quote it in bug reports |
| `timestamp`, `path` | When and `METHOD /url` |
| `retryable` | `true` when repeating later may work (429, 503, DB write conflict) |
| `hint` | (5xx and some 4xx) what a developer should check |
| `debug` | (5xx only) `{ name, message, prismaCode?, stack[] }`; sent outside production or when `ERROR_DEBUG=true` |

A database that cannot be reached or has no free connections returns `503 DATABASE_UNAVAILABLE` with `Retry-After`, never a bare 500.

| Status | `error` | When |
| --- | --- | --- |
| 400 | Bad Request | `VALIDATION_ERROR` – a field is invalid |
| 401 | Unauthorized | Missing/expired token (`UNAUTHORIZED`), wrong login (`INVALID_CREDENTIALS`), bad refresh (`REFRESH_INVALID`) |
| 403 | Forbidden | `FORBIDDEN` – member's role is not allowed to do this |
| 404 | Not Found | `NOT_FOUND` – also used when the user is **not a member** of the project (do not reveal it exists) |
| 409 | Conflict | `EMAIL_TAKEN`, `ALREADY_MEMBER`, `LABEL_EXISTS` |
| 422 | Unprocessable Entity | A business rule blocks it: `PROJECT_ARCHIVED`, `ASSIGNEE_NOT_MEMBER`, `OWNER_ROLE_LOCKED`, `OWNER_CANNOT_LEAVE` |

### Formats

- IDs: strings (the mock uses prefixes like `usr_…`, `prj_…`, `tsk_…`; any unique string works).
- Dates and times: ISO 8601 UTC strings, e.g. `2026-10-11T09:30:00.000Z`.
- Chart day keys (`completionTrend[].date`): `YYYY-MM-DD`.
- Enums are UPPER_SNAKE_CASE strings.

---

## 2. Data types

### Enums

```ts
type ProjectStatus = 'ACTIVE' | 'ARCHIVED';
type MemberRole    = 'OWNER' | 'ADMIN' | 'MEMBER';
type TaskStatus    = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
type TaskPriority  = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
```

### Shared

```ts
interface PageMeta {
  page: number; limit: number; total: number; totalPages: number;
  hasNext: boolean; hasPrev: boolean;
}

/** Small user embedded in other objects. */
interface UserSummary {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}
```

### Auth user (only used by `/auth/*`)

Note the field is `avatar` here, but `avatarUrl` in `UserSummary`.

```ts
interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatar?: string | null;
}
```

### Project

```ts
interface Project {
  id: string;
  name: string;                 // 2–100 chars
  description: string | null;   // max 1000 chars
  status: ProjectStatus;
  ownerId: string;
  myRole: MemberRole;           // role of the CURRENT user in this project
  memberCount: number;
  membersPreview: UserSummary[]; // first 4 members
  taskCount: number;
  doneCount: number;            // tasks with status DONE
  overdueCount: number;         // dueDate in the past AND status != DONE
  createdAt: string;
  updatedAt: string;
}
```

### Member

```ts
interface Member {
  id: string;
  projectId: string;
  role: MemberRole;
  joinedAt: string;
  user: UserSummary;
}
```

### Task and Label

```ts
interface Label {
  id: string;
  projectId: string;
  name: string;
  color: string;                // hex, e.g. "#6366f1"
}

interface Task {
  id: string;
  projectId: string;
  title: string;                // 1–200 chars
  description: string | null;   // max 5000 chars
  status: TaskStatus;
  priority: TaskPriority;
  position: number;             // order inside a board column, smaller first
  dueDate: string | null;
  assignee: UserSummary | null;
  creator: UserSummary;
  labels: Label[];
  commentCount: number;
  completedAt: string | null;   // set when status becomes DONE, cleared when it leaves DONE
  createdAt: string;
  updatedAt: string;
}
```

### Comment

```ts
interface Comment {
  id: string;
  taskId: string;
  body: string;                 // 1–2000 chars
  author: UserSummary;
  createdAt: string;
  updatedAt: string;
}
```

### Activity

```ts
interface Activity {
  id: string;
  projectId: string;
  projectName: string;
  actor: UserSummary;
  action: string;               // see action list in 7.4
  message: string;              // e.g. `moved "Login page" to Done`
  createdAt: string;
}
```

### Notification

```ts
interface Notification {
  id: string;
  type: string;                 // 'task.assigned' | 'member.added' | ...
  message: string;
  link: string | null;          // frontend route, e.g. "/projects/prj_1/board"
  readAt: string | null;
  createdAt: string;
}
```

### Dashboard

```ts
type MyTask = Task & { projectName: string };

interface DashboardSummary {
  projects: { total: number; active: number; archived: number };
  tasks: {
    total: number;
    completed: number;      // status DONE
    inProgress: number;     // status IN_PROGRESS
    overdue: number;
    highPriority: number;   // HIGH or URGENT and not DONE
    assignedToMe: number;   // assignee = me and not DONE
  };
  byStatus:   { status: TaskStatus;     count: number }[]; // always all 4, in order
  byPriority: { priority: TaskPriority; count: number }[]; // always all 4, in order
  completionTrend: { date: string; completed: number }[];  // last 14 days, oldest first, every day present
  recentActivity: Activity[];                              // newest 8
}
```

All dashboard numbers cover **only projects the current user belongs to**.

---

## 3. Endpoint summary (42 endpoints)

Auth column: 🔓 public · 🔑 any signed-in user · 👥 must be a project member (role rules in section 5).

| # | Method | Path | Auth | Returns |
| --- | --- | --- | --- | --- |
| **Auth** | | | | |
| 1 | POST | `/auth/register` | 🔓 | `201` `{ user, accessToken }` |
| 2 | POST | `/auth/login` | 🔓 | `200` `{ user, accessToken }` |
| 3 | POST | `/auth/refresh` | 🔓 | `200` `{ accessToken }` |
| 4 | POST | `/auth/logout` | 🔓 | `204` |
| 5 | GET | `/auth/me` | 🔑 | `AuthUser` |
| 6 | PUT | `/auth/profile` | 🔑 | `AuthUser` |
| 7 | DELETE | `/auth/profile` | 🔑 | `204` (optional, see note) |
| 8 | POST | `/auth/change-password` | 🔑 | `204` |
| 9 | POST | `/auth/forgot-password` | 🔓 | `204` |
| 10 | POST | `/auth/reset-password` | 🔓 | `204` |
| **Users** | | | | |
| 11 | GET | `/users/search?q=` | 🔑 | `{ data: UserSummary[] }` |
| **Projects** | | | | |
| 12 | GET | `/projects` | 🔑 | `{ data: Project[], meta }` |
| 13 | POST | `/projects` | 🔑 | `201` `{ data: Project }` |
| 14 | GET | `/projects/:projectId` | 👥 | `{ data: Project }` |
| 15 | PATCH | `/projects/:projectId` | 👥 | `{ data: Project }` |
| 16 | DELETE | `/projects/:projectId` | 👥 | `204` |
| 17 | POST | `/projects/:projectId/archive` | 👥 | `{ data: Project }` |
| 18 | POST | `/projects/:projectId/restore` | 👥 | `{ data: Project }` |
| 19 | GET | `/projects/:projectId/activity` | 👥 | `{ data: Activity[], meta }` |
| **Members** | | | | |
| 20 | GET | `/projects/:projectId/members` | 👥 | `{ data: Member[] }` |
| 21 | POST | `/projects/:projectId/members` | 👥 | `201` `{ data: Member }` |
| 22 | PATCH | `/projects/:projectId/members/:userId` | 👥 | `{ data: Member }` |
| 23 | DELETE | `/projects/:projectId/members/:userId` | 👥 | `204` |
| 24 | POST | `/projects/:projectId/transfer-ownership` | 👥 | `{ data: Member }` |
| **Tasks** | | | | |
| 25 | GET | `/projects/:projectId/tasks` | 👥 | `{ data: Task[], meta }` |
| 26 | GET | `/projects/:projectId/board` | 👥 | `{ data: Record<TaskStatus, Task[]> }` |
| 27 | POST | `/projects/:projectId/tasks` | 👥 | `201` `{ data: Task }` |
| 28 | GET | `/projects/:projectId/tasks/:taskId` | 👥 | `{ data: Task }` |
| 29 | PATCH | `/projects/:projectId/tasks/:taskId` | 👥 | `{ data: Task }` |
| 30 | PATCH | `/projects/:projectId/tasks/:taskId/move` | 👥 | `{ data: Task }` |
| 31 | DELETE | `/projects/:projectId/tasks/:taskId` | 👥 | `204` |
| **Comments** | | | | |
| 32 | GET | `/projects/:projectId/tasks/:taskId/comments` | 👥 | `{ data: Comment[] }` |
| 33 | POST | `/projects/:projectId/tasks/:taskId/comments` | 👥 | `201` `{ data: Comment }` |
| 34 | PATCH | `/projects/:projectId/tasks/:taskId/comments/:commentId` | 👥 | `{ data: Comment }` |
| 35 | DELETE | `/projects/:projectId/tasks/:taskId/comments/:commentId` | 👥 | `204` |
| **Labels** | | | | |
| 36 | GET | `/projects/:projectId/labels` | 👥 | `{ data: Label[] }` |
| 37 | POST | `/projects/:projectId/labels` | 👥 | `201` `{ data: Label }` |
| **Dashboard & notifications** | | | | |
| 38 | GET | `/dashboard/summary` | 🔑 | `{ data: DashboardSummary }` |
| 39 | GET | `/dashboard/my-tasks` | 🔑 | `{ data: MyTask[], meta }` |
| 40 | GET | `/notifications` | 🔑 | `{ data: Notification[], meta + unread }` |
| 41 | PATCH | `/notifications/:id/read` | 🔑 | `{ data: Notification }` |
| 42 | POST | `/notifications/read-all` | 🔑 | `{ data: { success: true } }` |

---

## 4. Endpoint details

In every project route, if the user is **not a member** of `:projectId` (or the project does not exist) return `404 NOT_FOUND`.

### 4.1 Auth (plain JSON, no `data` envelope)

#### 1. `POST /auth/register`
Request:
```json
{ "name": "Jane Doe", "email": "jane@example.com", "password": "secret123" }
```
- `name`: trimmed, min 2. `email`: valid, store lowercase. `password`: min 8, at least 1 letter and 1 number.
- Response `201`:
  ```json
  { "user": { "id": "usr_1", "name": "Jane Doe", "email": "jane@example.com", "avatar": null }, "accessToken": "<jwt>" }
  ```
  and `Set-Cookie: <refresh>; HttpOnly; SameSite=Lax; Path=/…`.
- Errors: `400 VALIDATION_ERROR` (with `details[].field`), `409 EMAIL_TAKEN`.

#### 2. `POST /auth/login`
Request: `{ "email": "...", "password": "..." }` (email compared case-insensitively).
- Response `200`: same as register, plus refresh cookie.
- Error: `401 INVALID_CREDENTIALS` – "Incorrect email or password" (same message for unknown email and wrong password).

#### 3. `POST /auth/refresh`
No body. Reads the refresh cookie.
- Response `200`: `{ "accessToken": "<jwt>" }` (and re-sets the cookie – rotate if you like).
- Error: `401 REFRESH_INVALID`.

#### 4. `POST /auth/logout`
No body. Clear the refresh cookie (`Max-Age=0`). Response `204`.

#### 5. `GET /auth/me`
Response `200`: `AuthUser`. The socket server also uses this to check tokens.

#### 6. `PUT /auth/profile`
Request (all optional): `{ "name"?: string, "email"?: string, "avatar"?: string | null }`.
- `name`: trimmed, min 2 (the form allows max 80).
- Response `200`: updated `AuthUser`.
- Error: `400 VALIDATION_ERROR` (`details[].field = "name"`).

#### 7. `DELETE /auth/profile`
Delete my account. Response `204`. *The client has this call, but no screen uses it yet and the mock does not implement it. Optional.*

#### 8. `POST /auth/change-password`
Request: `{ "currentPassword": "...", "newPassword": "..." }`.
- `newPassword`: min 8, at least 1 letter and 1 number.
- Response `204`.
- Errors: `400 VALIDATION_ERROR` with `field: "currentPassword"` ("Current password is incorrect") or `field: "newPassword"`.

#### 9. `POST /auth/forgot-password`
Request: `{ "email": "..." }`. Response `204` **always** (do not reveal whether the email exists). Send the reset link by email.

#### 10. `POST /auth/reset-password`
Request: `{ "token": "...", "password": "..." }`. Response `204`. Error `400` if the token is invalid or expired. The frontend reset page is `/reset-password?token=…`.

---

### 4.2 Users

#### 11. `GET /users/search?q=jane`
Find registered users to add to a project.
- `q` matches `name` or `email` (case-insensitive contains). If `q` is shorter than 2 characters, return an empty list.
- Max **10** results. Response: `{ "data": UserSummary[] }`.

---

### 4.3 Projects

#### 12. `GET /projects`
Projects the current user is a **member** of.

| Query | Type | Notes |
| --- | --- | --- |
| `search` | string | name contains, case-insensitive |
| `status` | `ACTIVE` \| `ARCHIVED` | optional |
| `page`, `limit` | number | see pagination (the command palette asks `limit=50`, the socket server asks `limit=100`) |

Sorted by `updatedAt` descending. Response: `{ data: Project[], meta }`.

#### 13. `POST /projects`
Request: `{ "name": "Website", "description"?: "..." }`
- Validation: `name` 2–100 chars (trimmed), `description` max 1000.
- Creates the project with `status: ACTIVE`, `ownerId = me`, and a Member row with role `OWNER`. Log activity `project.created`.
- Response `201`: `{ data: Project }`.

#### 14. `GET /projects/:projectId`
Response: `{ data: Project }` (with `myRole`).

#### 15. `PATCH /projects/:projectId`
Request: `{ "name"?: string, "description"?: string | null }`. Same validation as create. Empty description is stored as `null`. Allowed: OWNER, ADMIN. Log `project.updated`. Response: `{ data: Project }`.

#### 16. `DELETE /projects/:projectId`
Delete the project and cascade to members, tasks, comments, labels and activity. Allowed: OWNER only. Response `204`.

#### 17. `POST /projects/:projectId/archive`
No body. Sets `status = ARCHIVED`. OWNER only. Log `project.archived`. Response: `{ data: Project }`.

#### 18. `POST /projects/:projectId/restore`
No body. Sets `status = ACTIVE`. OWNER only. Log `project.restored`. Response: `{ data: Project }`.

#### 19. `GET /projects/:projectId/activity?page=1&limit=20`
Newest first. Any member. Response: `{ data: Activity[], meta }`.

---

### 4.4 Members

#### 20. `GET /projects/:projectId/members`
Not paginated. Order: OWNER, then ADMIN, then MEMBER; inside a role by `joinedAt` ascending. Response: `{ data: Member[] }`.

#### 21. `POST /projects/:projectId/members`
Request: `{ "userId": "usr_2", "role": "MEMBER" }` – `role` is `ADMIN` or `MEMBER` (default `MEMBER`; `OWNER` is invalid).
- Allowed: OWNER, ADMIN. An **ADMIN may only add `MEMBER`s** (adding an ADMIN → `403`).
- Errors: `400` role invalid or `userId` not found, `409 ALREADY_MEMBER`.
- Side effects: log `member.added`; create a notification for the added user (`type: member.added`, message `You were added to <project>`, link `/projects/<id>/board`).
- Response `201`: `{ data: Member }`.

#### 22. `PATCH /projects/:projectId/members/:userId`
Request: `{ "role": "ADMIN" | "MEMBER" }`. OWNER only.
- Errors: `404` target not a member, `422 OWNER_ROLE_LOCKED` (target is the owner), `400` bad role.
- Log `member.role_changed`. Response: `{ data: Member }`.

#### 23. `DELETE /projects/:projectId/members/:userId`
Remove a member, **or leave the project** when `:userId` is me.
- Leaving: any member except the owner.
- Removing someone else: OWNER, or ADMIN (ADMIN may only remove `MEMBER`s).
- The OWNER can never be removed / cannot leave → `422 OWNER_CANNOT_LEAVE` ("Transfer ownership before leaving the project").
- Side effect: set `assignee = null` on that user's tasks in this project. Log `member.removed`.
- Response `204`.

#### 24. `POST /projects/:projectId/transfer-ownership`
Request: `{ "userId": "usr_2" }`. OWNER only. The target must be another member of the project, otherwise `400` (`field: userId`).
- Result: target becomes `OWNER`, the caller becomes `ADMIN`, `project.ownerId` is updated. Log `project.transferred`.
- Response: `{ data: Member }` (the new owner's membership).

---

### 4.5 Tasks

**Archived projects are read-only:** create, update, move on an archived project return `422 PROJECT_ARCHIVED` ("Archived projects are read-only").

#### 25. `GET /projects/:projectId/tasks` (list view)

| Query | Type | Meaning |
| --- | --- | --- |
| `search` | string | title or description contains (case-insensitive) |
| `status` | repeated | `?status=TODO&status=DONE` – match any |
| `priority` | repeated | match any |
| `assigneeId` | string | a user id, or `me`, or `unassigned` |
| `labelId` | repeated | task has **any** of these labels |
| `overdue` | `true` | only overdue tasks |
| `sortBy` | `createdAt` \| `updatedAt` \| `dueDate` \| `priority` \| `title` | default `createdAt` |
| `order` | `asc` \| `desc` | default `desc` |
| `page`, `limit` | number | pagination |

- Sort notes: `priority` sorts by rank LOW < MEDIUM < HIGH < URGENT; `title` is case-insensitive; tasks with no `dueDate` go **last** when sorting by due date ascending.
- Response: `{ data: Task[], meta }`.

#### 26. `GET /projects/:projectId/board` (kanban view)
Same filter query as above (no pagination, no sort). Returns every matching task grouped by status, **always with all four keys**, each column sorted by `position` ascending:

```json
{ "data": { "TODO": [Task], "IN_PROGRESS": [Task], "IN_REVIEW": [Task], "DONE": [Task] } }
```

#### 27. `POST /projects/:projectId/tasks`
Request (`TaskInput`):
```json
{
  "title": "Build login page",
  "description": "optional",
  "status": "TODO",
  "priority": "MEDIUM",
  "dueDate": "2026-10-20T17:00:00.000Z",
  "assigneeId": "usr_2",
  "labelIds": ["lbl_1"]
}
```
- Required: `title` (1–200 chars after trim). Defaults: `status = TODO`, `priority = MEDIUM`, `assigneeId = null`, `dueDate = null`, `labelIds = []`.
- Validation: `description` max 5000; `status`/`priority` must be valid enums; `dueDate` must be a valid date; `assigneeId` must be a member of this project → else `422 ASSIGNEE_NOT_MEMBER`.
- `creator = me`. `position` = end of the column (max position in that status + 1000). If `status = DONE`, set `completedAt`.
- Any member may create. Log `task.created`. If the assignee is someone else, create a `task.assigned` notification (message `<actor> assigned you "<title>"`, link `/projects/<id>/list?task=<taskId>`).
- Response `201`: `{ data: Task }`.

#### 28. `GET /projects/:projectId/tasks/:taskId`
Response: `{ data: Task }`. `404` if the task is not in this project.

#### 29. `PATCH /projects/:projectId/tasks/:taskId`
Request: any subset of `TaskInput`. Send only what changed.
- Permission: OWNER/ADMIN any task; MEMBER only tasks they **created or are assigned to**.
- Same validation as create.
- When `status` changes: place the task at the end of the new column, set `completedAt` (now if `DONE`, otherwise `null`), log `task.moved`. Otherwise log `task.updated`.
- If `assigneeId` changes to another user, send the `task.assigned` notification.
- Always update `updatedAt`. Response: `{ data: Task }`.

#### 30. `PATCH /projects/:projectId/tasks/:taskId/move` (drag and drop)
Request:
```json
{ "status": "IN_REVIEW", "afterId": "tsk_9" }
```
- `afterId`: place the task directly after this task in the target column; `null` or missing = top of the column.
- Same permission and archived rules as `PATCH` task.
- Suggested position math (used by the mock): take the other tasks in the target column sorted by `position`. `before` = position of the `afterId` task (or `0`). `after` = position of the next task (or `before + 2000`). New position = `(before + after) / 2`. If positions get too close, re-number the column.
- If `status` changed: update `completedAt` and log `task.moved`.
- Response: `{ data: Task }`.

#### 31. `DELETE /projects/:projectId/tasks/:taskId`
Allowed: OWNER/ADMIN any task; MEMBER only tasks they **created**. Deletes its comments too. Log `task.deleted`. Response `204`.

---

### 4.6 Comments

Any project member can read and add comments (even on tasks in archived projects – the mock does not block it).

#### 32. `GET /projects/:projectId/tasks/:taskId/comments`
Oldest first. Not paginated. Response: `{ data: Comment[] }`.

#### 33. `POST /projects/:projectId/tasks/:taskId/comments`
Request: `{ "body": "Looks good" }` – trimmed, 1–2000 chars (`400` with `field: "body"` otherwise). Log `comment.added`. Response `201`: `{ data: Comment }`.

#### 34. `PATCH /projects/:projectId/tasks/:taskId/comments/:commentId`
Request: `{ "body": "..." }`. **Only the author** can edit (`403` otherwise). Updates `updatedAt`. Response: `{ data: Comment }`.

#### 35. `DELETE /projects/:projectId/tasks/:taskId/comments/:commentId`
Author, or OWNER/ADMIN. Response `204`.

---

### 4.7 Labels

#### 36. `GET /projects/:projectId/labels`
Not paginated. Response: `{ data: Label[] }`.

#### 37. `POST /projects/:projectId/labels`
Request: `{ "name": "Bug", "color": "#ef4444" }`. OWNER/ADMIN only.
- `name` required, trimmed; unique per project, case-insensitive → `409 LABEL_EXISTS`.
- `color` hex string; default `#6366f1`.
- Response `201`: `{ data: Label }`.

---

### 4.8 Dashboard

#### 38. `GET /dashboard/summary`
Response: `{ data: DashboardSummary }` (see section 2).

#### 39. `GET /dashboard/my-tasks?limit=6&overdue=true`
Tasks **assigned to me**, status not `DONE`, in my projects. Optional `overdue=true`. Sorted by `dueDate` ascending, no due date last. Paginated. Each item is a `Task` plus `projectName`.

---

### 4.9 Notifications

#### 40. `GET /notifications?page=1&limit=10`
Mine only, newest first. **`meta` also carries `unread`** (total unread count, not just this page – the bell badge uses it):

```json
{ "data": [Notification], "meta": { "page": 1, "limit": 10, "total": 5, "totalPages": 1, "hasNext": false, "hasPrev": false, "unread": 3 } }
```

#### 41. `PATCH /notifications/:id/read`
No body. Sets `readAt` if not yet set. `404` if it is not mine. Response: `{ data: Notification }`.

#### 42. `POST /notifications/read-all`
No body. Marks all mine as read. Response: `{ "data": { "success": true } }` (the frontend ignores the body).

---

## 5. Permissions

The backend must enforce these. The frontend only hides buttons (`src/lib/permissions.ts`).

| Action | OWNER | ADMIN | MEMBER |
| --- | :-: | :-: | :-: |
| View project, tasks, comments, labels, members, activity | ✅ | ✅ | ✅ |
| Update project name/description | ✅ | ✅ | ❌ |
| Archive / restore project | ✅ | ❌ | ❌ |
| Delete project | ✅ | ❌ | ❌ |
| Transfer ownership | ✅ | ❌ | ❌ |
| Leave project | ❌ (transfer first) | ✅ | ✅ |
| Add member | ✅ (ADMIN or MEMBER) | ✅ (MEMBER only) | ❌ |
| Remove member | ✅ | ✅ (MEMBERs only) | ❌ |
| Change a member's role | ✅ | ❌ | ❌ |
| Create task | ✅ | ✅ | ✅ |
| Edit / move task | ✅ any | ✅ any | only tasks they created or are assigned to |
| Delete task | ✅ any | ✅ any | only tasks they created |
| Add comment | ✅ | ✅ | ✅ |
| Edit comment | author only | author only | author only |
| Delete comment | ✅ any | ✅ any | own only |
| Create label | ✅ | ✅ | ❌ |

---

## 6. Real-time (Socket.io)

The demo uses `scripts/socket-server.mjs`; the real backend replaces it with its own Socket.io gateway. If `NEXT_PUBLIC_SOCKET_URL` is empty the app just runs without live updates, so this part is optional but recommended.

### Connection
- Client: `io(SOCKET_URL, { transports: ['websocket'], auth: { token: <accessToken> } })`. The token is re-read on every reconnect.
- Server must verify the token (reject with `unauthorized` if invalid).
- On connect, put the socket in these rooms:
  - `user:<userId>`
  - `project:<projectId>` for **every project the user belongs to**.
- Keep rooms in sync: when a member is added, join them to `project:<id>`; when a project is created, join its creator; when a member is removed or a project is deleted, leave the room (after sending the event).

### Events (server → client)

Event name is the Socket.io event. Payload is always:

```ts
interface RealtimePayload {
  projectId?: string;
  taskId?: string;
  userId?: string;     // user the change is about (added/removed member, assignee)
  actorId: string;     // who did it
  actorName: string;
  message?: string;    // short text for a toast
}
```

| Event | Sent after | Room |
| --- | --- | --- |
| `project.created` | `POST /projects` | `user:<actor>` |
| `project.updated` | `PATCH /projects/:id`, archive, restore | `project:<id>` |
| `project.deleted` | `DELETE /projects/:id` | `project:<id>` |
| `member.added` | `POST …/members` | `project:<id>` |
| `member.updated` | `PATCH …/members/:userId`, transfer-ownership | `project:<id>` |
| `member.removed` | `DELETE …/members/:userId` | `project:<id>` |
| `task.created` | `POST …/tasks` | `project:<id>` |
| `task.updated` | `PATCH …/tasks/:id` | `project:<id>` |
| `task.moved` | `PATCH …/tasks/:id/move` | `project:<id>` |
| `task.deleted` | `DELETE …/tasks/:id` | `project:<id>` |
| `comment.added` / `comment.updated` / `comment.deleted` | comment routes | `project:<id>` |
| `label.created` | `POST …/labels` | `project:<id>` |
| `notification.created` | a notification was created for a user (task assigned, added to project) | `user:<userId>` – include `message` |

The frontend reacts by refetching the affected queries and showing a toast for events caused by other people, so payloads can stay small.

---

## 7. Business rules checklist

### 7.1 Ownership
- Exactly one OWNER per project. `Project.ownerId` always matches the OWNER member.
- The project creator is the first OWNER.

### 7.2 `completedAt`
- Set to now when a task enters `DONE`; set to `null` when it leaves `DONE`. Used by `completionTrend`.

### 7.3 Overdue
- A task is overdue when `dueDate < now` **and** `status != DONE`. Used in `Project.overdueCount`, `?overdue=true`, and the dashboard.

### 7.4 Activity log
Write one row per change. `action` values the frontend/mocks use:

`project.created`, `project.updated`, `project.archived`, `project.restored`, `project.transferred`, `member.added`, `member.role_changed`, `member.removed`, `task.created`, `task.updated`, `task.moved`, `task.deleted`, `comment.added`.

Messages are short phrases that follow the actor name, e.g. `created "Login page"`, `moved "Login page" to Done`, `added Jane as member`.

### 7.5 Notifications
- `task.assigned` – when a task is created with an assignee, or the assignee changes, and the assignee is **not** the actor.
- `member.added` – when someone is added to a project.

### 7.6 Cascades
- Delete project → members, tasks, comments, labels, activity.
- Delete task → comments.
- Remove member → their tasks become unassigned.

### 7.7 Security
- Never return `password` or password hashes in any response.
- Hash passwords (bcrypt/argon2). Rate-limit login, forgot-password and register.
- For non-members answer `404`, not `403`.
- Do not trust `userId` in bodies for "who am I"; always use the token.

---

## 8. Suggested database tables

| Table | Main columns |
| --- | --- |
| `users` | id, name, email (unique, lowercase), password_hash, avatar_url, created_at |
| `refresh_tokens` | id, user_id, token_hash, expires_at, revoked_at |
| `password_resets` | id, user_id, token_hash, expires_at, used_at |
| `projects` | id, name, description, status, owner_id, created_at, updated_at |
| `project_members` | id, project_id, user_id, role, joined_at — unique (project_id, user_id) |
| `tasks` | id, project_id, title, description, status, priority, position (float), due_date, assignee_id, creator_id, completed_at, created_at, updated_at |
| `labels` | id, project_id, name, color — unique (project_id, lower(name)) |
| `task_labels` | task_id, label_id |
| `comments` | id, task_id, author_id, body, created_at, updated_at |
| `activity` | id, project_id, actor_id, action, message, created_at |
| `notifications` | id, user_id, type, message, link, read_at, created_at |

Indexes worth adding: `tasks(project_id, status, position)`, `tasks(assignee_id)`, `project_members(user_id)`, `activity(project_id, created_at)`, `notifications(user_id, created_at)`.

---

## 9. Quick test accounts (mock only)

The mock data (`src/mocks/data/users.json`) has demo users; the dev refresh cookie `tf_mock_refresh=usr_owner` signs you in as the demo owner. A real backend does not need these, but similar seed data makes the frontend easy to try.

## 10. Switching the frontend to the real backend

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:4040/api/v1
NEXT_PUBLIC_SOCKET_URL=http://localhost:4001   # or empty to turn live updates off
```
