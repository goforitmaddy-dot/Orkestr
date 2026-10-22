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
│   │   └── globals.css        # Tailwind directives and developer theme
│   ├── components/
│   │   ├── layout/            # Sidebar, Header, AppShell
│   │   └── ui/                # Button, Card, Input, Textarea, Modal, Badge, etc.
│   ├── lib/
│   │   └── api.ts             # Centralized typed API client
│   ├── types/
│   │   └── index.ts           # Shared TypeScript interfaces
│   ├── public/
│   ├── package.json
│   └── .env.example
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
│   │   └── 001_initial_schema.sql  # SQL schema (projects, users, project_members)
│   ├── package.json
│   └── .env.example
│
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
  * `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
  * `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
* **`project_members`**:
  * `id` (UUID PK, `gen_random_uuid()`)
  * `project_id` (UUID NOT NULL, REFERENCES projects ON DELETE CASCADE)
  * `user_id` (UUID NOT NULL, REFERENCES users ON DELETE CASCADE)
  * `role` (TEXT NOT NULL CHECK ('OWNER', 'ADMIN', 'MEMBER'))
  * `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
  * Constraint: `UNIQUE (project_id, user_id)`

---

## 4. Manual PostgreSQL Setup

If PostgreSQL is not currently installed or running on your system:

### Option A: Install via Homebrew (macOS)
```bash
# 1. Install PostgreSQL
brew install postgresql@16

# 2. Start PostgreSQL service
brew services start postgresql@16

# 3. Create database and user
createdb ai_project_manager
```

### Option B: Using Postgres.app
1. Download and run [Postgres.app](https://postgresapp.com/).
2. Click **Initialize** to create a new database cluster.
3. Open a terminal and run:
   ```bash
   createdb ai_project_manager
   ```

### Option C: Use an existing PostgreSQL instance
Update `backend/.env` with your connection credentials:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ai_project_manager
DB_USER=your_user
DB_PASSWORD=your_password
```

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

| Method | Endpoint | Description | Request Body | Status Codes |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Health & DB status check | None | `200` |
| `GET` | `/api/projects` | List all projects | None | `200` |
| `POST` | `/api/projects` | Create a new project | `{ name: string, description?: string }` | `201`, `400` |
| `GET` | `/api/projects/:id` | Get project by UUID | None | `200`, `404` |
| `PATCH` | `/api/projects/:id` | Update project name/description | `{ name?: string, description?: string }` | `200`, `400`, `404` |
| `DELETE` | `/api/projects/:id` | Delete project | None | `200`, `404` |

---

## 8. Verification Results

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
