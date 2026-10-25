# Orkestr: AI-Powered Project Manager (MVP Foundation)

A clean, functional, and maintainable foundation for an AI-powered Project Manager. Built with Next.js (App Router), Express with TypeScript, and PostgreSQL.

---

## 1. Architecture & Port Mapping

The system is split into two independent applications communicating over REST:

| Service | Technology | Port | URL |
| :--- | :--- | :--- | :--- |
| **Frontend** | Next.js 14 (App Router), React 18, Tailwind CSS, Lucide | `3000` | [http://localhost:3000](http://localhost:3000) |
| **Backend** | Node.js, Express, TypeScript, Zod, pg | `5001`* | [http://localhost:5001/api](http://localhost:5001/api) |
| **Database** | PostgreSQL | `5432` | `postgresql://localhost:5432/ai_project_manager` |

*\*Note on Port 5001: The backend defaults to port `5001` instead of `5000` because macOS Monterey/Ventura/Sonoma/Sequoia reserves port `5000` for AirPlay Receiver (`ControlCenter`). The port is completely configurable via the `PORT` environment variable.*

---

## 2. Directory Structure

```
orkestr/
├── frontend/
│   ├── app/
│   │   ├── dashboard/
│   │   │   └── page.tsx       # Summary metrics, recent projects, modal creation
│   │   ├── projects/
│   │   │   ├── page.tsx       # Project list, search, modal creation, empty state
│   │   │   └── [id]/
│   │   │       └── page.tsx   # Project details, edit/delete, future AI placeholders
│   │   ├── settings/
│   │   │   └── page.tsx       # Preferences & provider placeholders
│   │   ├── layout.tsx         # AppShell wrapper (Sidebar + Header)
│   │   ├── page.tsx           # Redirects to /dashboard
│   │   ├── globals.css        # Tailwind directives and developer theme
│   │   ├── components/
│   │   │   ├── layout/            # Sidebar, Header, AppShell
│   │   │   └── ui/                # Button, Card, Input, Textarea, Modal, Badge, etc.
│   │   ├── lib/
│   │   │   └── api.ts             # Centralized typed API client
│   │   ├── types/
│   │   │   └── index.ts           # Shared TypeScript interfaces
│   │   ├── public/
│   │   ├── package.json
│   │   └── .env.example
│
├── backend/
│   ├── src/
│   │   ├── config/            # Environment variable loading & validation
│   │   ├── controllers/       # Health & Project HTTP controllers
│   │   ├── db/                # PostgreSQL pg pool & migration runner
│   │   ├── middleware/        # Centralized error handler & logger
│   │   ├── routes/            # REST API route definitions
│   │   ├── services/          # Parameterized SQL database queries
│   │   ├── app.ts             # Express app creation & middleware wiring
│   │   └── server.ts          # Server entrypoint with graceful shutdown
│   ├── migrations/
│   │   ├── 001_initial_schema.sql  # SQL schema (projects, users, project_members)
│   │   ├── 002_monitoring_and_incidents.sql  # Webhooks, workflow runs, incidents
│   │   └── 003_realtime_monitoring.sql  # Repository links, runtime errors, poll state
│   ├── package.json
│   └── .env.example
│
├── docker-compose.yml          # PostgreSQL 17 service + named data volume
├── .gitignore
└── README.md
```

---

## 3. Database Schema

The initial PostgreSQL schema is defined in `backend/migrations/001_initial_schema.sql`:

* **`projects`**:
  * `id` (UUID PK, `gen_random_uuid()`)
  * `name` (TEXT NOT NULL)
  * `description` (TEXT NULL)
  * `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
  * `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
* **`users`**:
  * `id` (UUID PK, `gen_random_uuid()`)
  * `name` (TEXT NOT NULL)
  * `email` (TEXT NOT NULL UNIQUE)
  * `password_hash` (TEXT NULL, scrypt - added by `004_auth_and_connections.sql`)
  * `is_active` (BOOLEAN NOT NULL DEFAULT TRUE)
  * `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
  * `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
* **`sessions`** (added by `004_auth_and_connections.sql`):
  * `id` (UUID PK), `user_id` (FK users, ON DELETE CASCADE)
  * `token_hash` (TEXT NOT NULL UNIQUE, SHA-256 digest of the session token)
  * `user_agent`, `created_at`, `last_used_at`, `expires_at`
* **`github_connections`** (added by `004_auth_and_connections.sql`):
  * `id` (UUID PK), `user_id` (FK users, ON DELETE CASCADE), `provider`
  * `account_login`, `account_id`
  * `token_encrypted` (TEXT NOT NULL, AES-256-GCM payload, never returned by the API)
  * `token_hint` (TEXT, e.g. `••••a1b2`), `scopes` (TEXT[])
  * `status` (`unverified` | `valid` | `invalid`), `last_validated_at`, `last_error`
  * Constraint: `UNIQUE (user_id, provider)`
* **`projects.owner_id`** (added by `004_auth_and_connections.sql`):
  * `owner_id` (UUID NULL, FK users ON DELETE SET NULL) - the account that
    created the project, used to pick the right GitHub token while polling
* **`application_errors.owner_id`** (added by `005_runtime_error_ownership.sql`):
  * the account that reported the runtime error
* **`incidents.owner_id`** (added by `006_incident_ownership.sql`):
  * the account that owns the project monitoring the repository
* **`project_members`**:
  * `id` (UUID PK, `gen_random_uuid()`)
  * `project_id` (UUID NOT NULL, REFERENCES projects ON DELETE CASCADE)
  * `user_id` (UUID NOT NULL, REFERENCES users ON DELETE CASCADE)
  * `role` (TEXT NOT NULL CHECK ('OWNER', 'ADMIN', 'MEMBER'))
  * `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
  * Constraint: `UNIQUE (project_id, user_id)`

---

## 4. PostgreSQL Setup

If PostgreSQL is not currently installed or running on your system:

### Option A: Docker (Recommended)

A `docker-compose.yml` is included at the repository root, pinned to the same
credentials the backend expects out of the box.

```bash
# 1. Start PostgreSQL (creates the container, volume and database)
docker compose up -d

# 2. Confirm it is healthy
docker compose ps
```

The database is exposed on `localhost:5432` with user `postgres`, password
`postgres`, and database `ai_project_manager`. Data persists in the named
volume `orkestr-pgdata`.

Useful commands:
```bash
docker compose logs -f postgres   # Tail database logs
docker compose stop postgres      # Stop the database
docker compose up -d postgres     # Start it again
docker compose down               # Stop and remove the container (volume is kept)
```

### Option B: Install via Homebrew (macOS)
```bash
# 1. Install PostgreSQL
brew install postgresql@16

# 2. Start PostgreSQL service
brew services start postgresql@16

# 3. Create database and user
createdb ai_project_manager
```

### Option C: Using Postgres.app
1. Download and run [Postgres.app](https://postgresapp.com/).
2. Click **Initialize** to create a new database cluster.
3. Open a terminal and run:
   ```bash
   createdb ai_project_manager
   ```

### Option D: Use an existing PostgreSQL instance
Update `backend/.env` with your connection credentials:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_project_manager
DB_USER=your_user
DB_PASSWORD=your_password
```

### Environment Files

Both services read their configuration from an env file. Copy the provided
examples and adjust as needed:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

`backend/.env` is resolved relative to the backend package root, so the
server and the migration runner work regardless of the directory they are
launched from.

---

## 5. Running Migrations

Once PostgreSQL is running, apply the database schema:

```bash
cd backend
npm run migrate
```

This will automatically execute `migrations/001_initial_schema.sql` and record the migration in the `schema_migrations` tracking table.

---

## 6. Development & Production Scripts

### Backend (`cd backend`)
* `npm run dev`: Starts the development server with automatic restart via `tsx watch`.
* `npm run build`: Compiles TypeScript to JavaScript in `dist/`.
* `npm run start`: Runs compiled production code with `node dist/server.js`.
* `npm run lint`: Runs ESLint on all TypeScript files.
* `npm run migrate`: Executes pending SQL migrations using the migration runner.

### Frontend (`cd frontend`)
* `npm run dev`: Starts Next.js development server on `http://localhost:3000`.
* `npm run build`: Creates an optimized production build.
* `npm run start`: Runs the Next.js production server.
* `npm run lint`: Runs Next.js ESLint checks.

---

## 7. REST API Endpoints

All endpoints are mounted under `/api`:

All endpoints are mounted under `/api`. Every endpoint except `/api/health`,
`POST /api/webhooks/github` and `POST /api/errors` requires a session
(`orkestr_session` cookie or `Authorization: Bearer <session token>`).

| Method | Endpoint | Description | Request Body | Status Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Health & DB status check | None | `200` |
| `POST` | `/api/auth/signup` | Create an account and start a session | `{ name: string, email: string, password: string }` | `201`, `400`, `409` |
| `POST` | `/api/auth/login` | Sign in and start a session | `{ email: string, password: string }` | `200`, `401` |
| `POST` | `/api/auth/logout` | Destroy the current session | None | `200` |
| `GET` | `/api/auth/me` | The signed-in account | None | `200`, `401` |
| `PATCH` | `/api/auth/me` | Update the display name | `{ name: string }` | `200`, `400` |
| `GET` | `/api/github-connections` | List the account's GitHub connections | None | `200` |
| `POST` | `/api/github-connections` | Connect a personal access token | `{ token: string, provider?: string }` | `201`, `400` |
| `GET` | `/api/github-connections/:id` | Read one connection | None | `200` |
| `POST` | `/api/github-connections/:id/validate` | Re-verify a stored token | None | `200`, `404` |
| `DELETE` | `/api/github-connections/:id` | Remove a stored token | None | `200`, `404` |
| `GET` | `/api/projects` | List all projects | None | `200` |
| `POST` | `/api/projects` | Create a new project | `{ name: string, description?: string, provider?: string, repository?: string, monitoringEnabled?: boolean }` | `201`, `400` |
| `GET` | `/api/projects/:id` | Get project by UUID | None | `200`, `404` |
| `PATCH` | `/api/projects/:id` | Update project (name, description, repository, monitoring) | `{ name?: string, description?: string, repository?: string \| null, monitoringEnabled?: boolean }` | `200`, `400`, `404` |
| `DELETE` | `/api/projects/:id` | Delete project | None | `200`, `404` |
| `GET` | `/api/incidents` | List CI incidents (`?status=`, `?repository=`) | None | `200` |
| `GET` | `/api/incidents/:id` | Incident with workflow runs and failure occurrences | None | `200`, `404` |
| `POST` | `/api/incidents/:id/resolve` | Record a manual resolution | None | `200`, `404` |
| `POST` | `/api/errors` | Report an application runtime error | `{ message: string, stackTrace?: string, errorType?: string, service?: string, environment?: string, repository?: string, projectId?: string, affectedUsers?: number, context?: object }` | `201` (new), `200` (occurrence), `400` |
| `GET` | `/api/errors` | List runtime errors (`?status=`, `?projectId=`, `?repository=`) | None | `200` |
| `GET` | `/api/errors/:id` | Get a single runtime error | None | `200`, `404` |
| `POST` | `/api/errors/:id/resolve` | Mark a runtime error as resolved | None | `200`, `404` |
| `GET` | `/api/monitoring/stream` | Server-Sent Events stream of live monitoring events | None | `200` (text/event-stream) |
| `GET` | `/api/monitoring/status` | Credentials, targets and last poll cycle | None | `200` |
| `GET` | `/api/monitoring/summary` | Active/recovered counters for the dashboard | None | `200` |
| `POST` | `/api/monitoring/poll` | Run a monitoring cycle immediately | None | `200` |
| `POST` | `/api/webhooks/github` | GitHub webhook delivery (HMAC-SHA256 verified) | GitHub payload | `200`, `401`, `400` |

---

## 8. Live Error Monitoring

The monitor reports **real** failures only. There is no simulation endpoint and
no fabricated telemetry anywhere in the pipeline.

### Data flow

```
GitHub Actions (REST API + webhooks)
        │
        ▼
  ciMonitor.service.ts ──▶ normalizer ──▶ deduplicator ──▶ incidentCorrelation
        │                                                             │
Application runtime errors (POST /api/errors) ────────────────┐      ▼
        │                                                     │  incidents /
        ▼                                                     │  application_errors
  applicationError.service.ts ───────────────────────────────┘      │
                                                                    ▼
                                                        eventBus.service.ts (SSE)
                                                                    │
                                                                    ▼
                                                     frontend EventSource subscriber
```

The backend always writes to the database **before** broadcasting, so a
browser that re-fetches on an event can never see stale state.

### 1. Link a project to a repository

Existing projects are linked to a GitHub repository (`owner/repo`) either from
the **Projects** page (create modal) or from a project's detail page
(*Configure*). Monitoring is switched on per project:

```bash
curl -X PATCH http://localhost:5001/api/projects/<project-id> \
  -H 'Content-Type: application/json' \
  -d '{"provider":"github","repository":"owner/repo","monitoringEnabled":true}'
```

### 2. Connect your GitHub token

Every account connects its own Personal Access Token in
**Settings > GitHub Connection**. The token is verified against
`GET /api/user` before it is stored, encrypted with AES-256-GCM, and never
returned by the API again - only a hint such as `••••a1b2` and the validation
state are exposed.

* Fine-grained tokens need **Actions: Read** and **Metadata: Read** for public
  repositories, plus **Contents: Read** for private ones.
* The poller uses the token of the account that owns the project. Projects
  without an owner, or owners without a connection, fall back to the server
  wide token in `backend/.env`:

```env
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxx
GITHUB_WEBHOOK_SECRET=optional-shared-secret
```

* `GITHUB_WEBHOOK_SECRET` is optional. When set, webhook deliveries are
  verified with HMAC-SHA256 and rejected with `401` when the signature does not
  match.
* Without any token the monitor still ingests application runtime errors; the
  Live Monitor shows a "connect your GitHub token" prompt instead of pretending
  to monitor anything.

### 3. Report application runtime errors

Point your service at the ingestion endpoint:

```bash
curl -X POST http://localhost:5001/api/errors \
  -H 'Content-Type: application/json' \
  -d '{
        "message": "TypeError: Cannot read properties of undefined",
        "stackTrace": "at checkout (src/payments/checkout.ts:42:18)",
        "errorType": "TypeError",
        "service": "payment-gateway",
        "environment": "production",
        "repository": "owner/repo",
        "affectedUsers": 12
      }'
```

Repeated reports of the same defect are grouped by fingerprint, so the counter
(`occurrence_count`) grows instead of flooding the monitor with duplicates.

### 4. Watch it live

Open `http://localhost:3000/monitor`. The page subscribes to
`GET /api/monitoring/stream` with `EventSource` and updates the moment an
incident or runtime error is created, updated or resolved. If the stream drops
it falls back to a 10 second poll instead of going silent. `Pause`/`Resume`
toggles live updates, and `Poll Now` runs a monitoring cycle on demand.

### 5. Optional: GitHub webhooks

Create a repository webhook pointing at `https://<host>/api/webhooks/github`
with the **Workflow runs** and **Workflow jobs** events, and set the same
secret in `GITHUB_WEBHOOK_SECRET`. Polling still works without webhooks;
webhooks simply make failures appear sooner.

### Monitoring configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `MONITORING_ENABLED` | `true` | Master switch for the background poller |
| `MONITORING_POLL_INTERVAL_MS` | `30000` | Delay between monitoring cycles |
| `MONITORING_INITIAL_LOOKBACK_MINUTES` | `60` | Lookback window for the first poll of a repository |
| `MONITORING_MAX_RUNS_PER_POLL` | `20` | Workflow runs fetched per repository per cycle |
| `MONITORING_MAX_LOG_BYTES` | `1048576` | Bytes of a job log read before excerpting (tail preserved) |

---

## 9. Accounts, Sessions and Per-User Tokens

Orkestr has real accounts. There is no demo mode and no shared session.

### Signing up and signing in

| Endpoint | Purpose |
| :--- | :--- |
| `POST /api/auth/signup` | `{ name, email, password }` - creates the account and starts a session |
| `POST /api/auth/login` | `{ email, password }` - starts a session |
| `POST /api/auth/logout` | Destroys the session on the server and clears the cookie |
| `GET /api/auth/me` | The signed-in account |
| `PATCH /api/auth/me` | Updates the display name |

* Passwords are hashed with **scrypt** (`N=16384, r=8, p=1`) and a per-user
  salt; the plaintext password is never stored.
* A session is an opaque 32 byte random token. Only its **SHA-256 digest** is
  stored in `sessions`, the raw token exists solely in the user's cookie.
* The cookie `orkestr_session` is `httpOnly`, `SameSite=Lax` and expires after
  `SESSION_TTL_DAYS` (default 30 days). The middleware also accepts
  `Authorization: Bearer <session token>` for scripts and CI jobs.
* The frontend keeps the session out of reach of JavaScript, so every API call
  sends `credentials: 'include'` and the `EventSource` for the live stream is
  opened with `withCredentials: true`.

### Per-user GitHub connections

| Endpoint | Purpose |
| :--- | :--- |
| `GET /api/github-connections` | The connections of the signed-in account |
| `POST /api/github-connections` | `{ token }` - validates the token against `GET /api/user` and stores it encrypted |
| `GET /api/github-connections/:id` | One connection (metadata only) |
| `POST /api/github-connections/:id/validate` | Re-verifies a stored token |
| `DELETE /api/github-connections/:id` | Removes the stored token |

* Tokens are encrypted with **AES-256-GCM** using `ENCRYPTION_KEY`. When the
  variable is missing the server generates a key once and writes it to
  `backend/.env` with `0600` permissions.
* A connection carries its validation state (`valid` / `invalid` /
  `unverified`), the granted scopes and a `••••a1b2` hint. The raw token is
  never sent to the browser.
* The background poller resolves the credential per project:
  `project.owner_id` -> encrypted connection -> decrypt -> use that token.
  When the owner has no (valid) connection the server wide `GITHUB_TOKEN` is
  used as a fallback.

### Data isolation

Everything a monitor shows is scoped to the signed-in account:

| Data | Scope |
| :--- | :--- |
| Projects | `projects.owner_id` - another account gets `404` |
| CI incidents | `incidents.owner_id` |
| Runtime errors | `application_errors.owner_id` (the fingerprint includes the owner, so counters are never shared) |
| Monitoring targets and dashboard counters | the owner's projects only |

Records without an owner (created before accounts existed, or reported by a
service without a session) stay shared until they are claimed, so nothing is
lost when the feature is switched on.

### Configuration

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `ENCRYPTION_KEY` | generated | 32 byte key for the AES-256-GCM token encryption |
| `SESSION_COOKIE_NAME` | `orkestr_session` | Name of the session cookie |
| `SESSION_TTL_DAYS` | `30` | Session lifetime |
| `SESSION_SECURE_COOKIES` | `false` | Set to `true` when serving over HTTPS |

---

## 10. Verification Results

All core components have been implemented and verified:

1. **TypeScript Build**:
   - Backend `npm run build` -> Passed (0 errors).
   - Frontend `npm run build` -> Passed (7 static/dynamic pages generated).
2. **Linting**:
   - Backend `npm run lint` -> Passed (0 errors).
   - Frontend `npm run lint` -> Passed (0 errors, 0 warnings).
3. **API & Endpoints**:
   - `GET /api/health` -> HTTP 200 with JSON health report.
   - `POST /api/projects` -> Zod validation returns HTTP 400 when name is missing or empty.
   - `GET /api/projects/:id` -> Returns HTTP 404 on non-existent project IDs.
   - `PATCH /api/projects/:id` -> Returns HTTP 404 on non-existent project IDs.
   - `DELETE /api/projects/:id` -> Returns HTTP 404 on non-existent project IDs.
   - Error handling -> Gracefully catches database downtime and returns HTTP 503 without leaking stack traces.
4. **Frontend Navigation & Communication**:
   - Root `/` route returns HTTP 307 temporary redirect to `/dashboard`.
   - `/dashboard`, `/projects`, and `/settings` render with clean developer theme.
   - Reusable UI component library (`Button`, `Card`, `Input`, `Textarea`, `Modal`, `Badge`, `EmptyState`, `LoadingSpinner`) working.
5. **Accounts & GitHub Connections** (`npm test` in `backend`):
   - `POST /api/auth/signup` -> HTTP 201, sets the `orkestr_session` cookie; duplicate emails return HTTP 409.
   - `GET /api/auth/me` -> resolves the account; the session token is stored as a SHA-256 digest.
   - `POST /api/auth/login` with a wrong password -> HTTP 401; with the right password -> HTTP 200.
   - `POST /api/auth/logout` -> the cookie stops working (HTTP 401 on `/api/auth/me`).
   - `GET /api/projects`, `/api/incidents`, `/api/errors`, `/api/monitoring/*` and `/api/github-connections` -> HTTP 401 without a session.
   - `POST /api/github-connections` -> the raw token is never echoed, is stored as an AES-256-GCM payload and only a `••••xxxx` hint is returned.
   - Project isolation -> another account gets HTTP 404 for the project and cannot patch it.
   - Data isolation -> incidents and runtime errors are filtered by the owner, and the runtime error fingerprint contains the owner so counters never mix.
6. **Real-Time Monitoring** (`npm test` in `backend`):
   - `GET /api/monitoring/stream` -> HTTP 200 `text/event-stream`, emits `monitoring.status`.
   - `POST /api/incidents/simulate` -> HTTP 404 (the simulation endpoint no longer exists).
   - `POST /api/errors` -> HTTP 201 on first report, HTTP 200 with an incremented `occurrence_count` on repeats.
   - `GET /api/monitoring/summary` -> counts open CI incidents and runtime errors.
   - `POST /api/errors/:id/resolve` -> HTTP 200 and pushes `error.resolved` over SSE.
   - `POST /api/monitoring/poll` -> HTTP 200; reports honestly when no token (server wide or personal) is available.
7. **GitHub Integration** (`github_integration.test.ts`, GitHub API stubbed):
   - `GET /api/health` -> with a session and a verified personal token, `github.userTokenConfigured=true`, `github.source="user"` and `services.monitoring="configured"` (the header no longer shows "No token"); without a session the connection is not leaked.
   - `GET /api/monitoring/status` -> reports the account's own connection and exposes only metadata, never the raw token.
   - `POST /api/monitoring/poll` -> runs only the signed-in account's monitored repositories, uses the saved/verified token and inspects the repository selected in Projects (the GitHub `actions/runs` response is read from its `workflow_runs` envelope).
   - A real GitHub failure (e.g. HTTP 403 missing permission) -> `success=false`, the raw API error is returned in `data.githubApiErrors`, it is persisted on the target's `lastError`, and no incidents are fabricated; a later successful poll clears the error.
   - Live check with a real personal access token -> the poller used the token of the project owner, reached the GitHub API and returned `0` workflow runs for a repository that genuinely has no workflows (no fabricated data).

---

## 11. GitHub Integration & Setup Guide

Orkestr provides genuine GitHub integration divided into two distinct concepts:
1. **Developer Identity Linking**: Links an Orkestr user account to their verified GitHub identity (`github_user_id` and username) using GitHub OAuth authorization code flow with CSRF state protection.
2. **Project Repository Connection**: Connects an Orkestr project to a specific repository (`github_repo_owner`, `github_repo_name`, `github_repo_id`, `github_default_branch`, `github_installation_id`). Restricted to project **OWNER** and **ADMIN** roles.

### Manual GitHub App Configuration

To configure a GitHub App for Orkestr in development:
1. Go to **GitHub Developer Settings**: `https://github.com/settings/apps` -> **New GitHub App**.
2. Fill in the required fields:
   - **GitHub App name**: `Orkestr-Dev` (or your chosen name)
   - **Homepage URL**: `http://localhost:3000`
   - **Callback URL**: `http://localhost:5001/api/auth/github/callback`
   - **Webhook Active**: Uncheck for now (until Live Project Monitor phase).
3. Set Permissions:
   - **Account permissions** -> **Email addresses**: `Read-only`
4. Generate a **Client Secret** under your newly created App.
5. Add the credentials to `backend/.env`:
   ```bash
   GITHUB_APP_CLIENT_ID=your_client_id_here
   GITHUB_APP_CLIENT_SECRET=your_client_secret_here
   GITHUB_OAUTH_CALLBACK_URL=http://localhost:5001/api/auth/github/callback
   FRONTEND_URL=http://localhost:3000
   ```

### Running GitHub Integration Tests

The automated test suite mocks external GitHub responses and does not require active credentials or internet access:
```bash
cd backend
npm run test:github
```

---

## 12. GitHub Webhook Ingestion Foundation

Orkestr includes a dedicated, secure GitHub webhook ingestion pipeline designed to receive and store repository activity (push commits and pull requests) before AI verification.

### Webhook Endpoint Specifications
* **Endpoint**: `POST /api/webhooks/github`
* **Authentication**: Unauthenticated by user session; authenticated via cryptographic `X-Hub-Signature-256` HMAC-SHA256 signature verification using `GITHUB_WEBHOOK_SECRET`.
* **Raw Body Verification**: Evaluates signatures directly against the raw incoming byte buffer in constant time (`crypto.timingSafeEqual`) before JSON parsing.
* **Idempotency & Deduplication**: Deliveries are tracked by `X-GitHub-Delivery` against the database's unique `event_id` constraint. Retries return 200 without creating duplicate records.
* **Storage**: Ingested events are recorded in `github_webhook_events` with status `PENDING` (events are never marked processed merely upon receipt).
* **Project Matching**: Events are matched exclusively against actively connected projects by numeric `github_repo_id` (repository names alone are never trusted, and developer identities are never guessed from commit author strings).

### Manual GitHub App Webhook Setup

To receive real webhook deliveries on your development machine:

1. **Expose Local Backend Port (5001) via Tunnel**:
   ```bash
   # Using ngrok (or localtunnel / Cloudflare tunnel):
   ngrok http 5001
   ```
   Note the HTTPS forwarding URL (e.g., `https://abc123xyz.ngrok-free.app`).

2. **Configure Webhook in GitHub App**:
   * Navigate to **GitHub Developer Settings**: `https://github.com/settings/apps` -> Select your App.
   * Under **Webhook**:
     * Check **Active**.
     * **Webhook URL**: `https://abc123xyz.ngrok-free.app/api/webhooks/github`
     * **Webhook secret**: Generate a random secret (e.g. `openssl rand -hex 20`).
     * **SSL verification**: Enable.
   * Under **Permissions & events**:
     * **Repository permissions**:
       * `Contents`: Read-only (enables `push` events).
       * `Pull requests`: Read-only (enables `pull_request` events).
     * **Subscribe to events**:
       * Check `Push`.
       * Check `Pull request`.
   * Click **Save changes**.

3. **Configure Environment Secret**:
   In `backend/.env`, set:
   ```bash
   GITHUB_WEBHOOK_SECRET=your_generated_webhook_secret_here
   ```
   Restart or reload your backend server.

4. **Verify Live Deliveries**:
   * In your GitHub App settings, go to **Advanced** -> **Recent Deliveries**.
   * Click the default `ping` delivery or click **Redeliver**; verify it returns HTTP 200.
   * Push a commit or open a pull request on your connected repository (e.g., `uttam515/SwarmX`).
   * Inspect the `github_webhook_events` table in PostgreSQL:
     ```sql
     SELECT id, event_id, event_type, project_id, status, created_at
     FROM github_webhook_events
     ORDER BY created_at DESC
     LIMIT 5;
     ```

### Running Automated Webhook Tests

```bash
cd backend
npm run test:webhooks
```
All 22 automated webhook tests run with synthetic payloads and generated HMAC secrets without requiring live GitHub credentials.
