# ProjectPulse

AI-assisted multi-project tracking, task management, daily work reporting and team collaboration.
Next.js (App Router) + TypeScript, PostgreSQL + Prisma, Tailwind CSS, Recharts.

It runs locally with **no paid services**: files are stored on disk, password-reset links are printed to the
server console, and the AI insights are a deterministic analyzer that explains every finding.

## Contents

- [What's inside](#whats-inside)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Demo accounts](#demo-accounts)
- [Try the core workflows](#try-the-core-workflows)
- [Scripts](#scripts)
- [Tests](#tests)
- [Project structure](#project-structure)
- [How the important parts work](#how-the-important-parts-work)
- [Verification status](#verification-status)
- [Deferred and known limitations](#deferred-and-known-limitations)
- [Production deployment checklist](#production-deployment-checklist)

## What's inside

| Area | What you get |
| --- | --- |
| **Auth & accounts** | Email/password sign-in (bcrypt), logout, forgot/reset password with hashed single-use tokens, change password, profile (avatar URL, phone, skills, timezone), account status (active / inactive / suspended), last-login tracking, login audit, failed-login throttling |
| **Roles** | `SUPER_ADMIN`, `ADMIN`, `PROJECT_MANAGER`, `TEAM_LEAD`, `TEAM_MEMBER`, `CLIENT_VIEWER`, enforced in every server action, API route and page, not only in the UI |
| **Projects** | List with search/filters/pagination, create, edit, archive/restore, tabbed detail page: Overview, Tasks, Board, Timeline, Milestones, Daily updates, Files, Team, Activity, Risks, Reports, Settings |
| **Tasks** | Full CRUD, multiple assignees, labels, checklist, dependencies (cycle-checked), blocker reasons, required-evidence flag, comments with @mentions, status history, Kanban board with drag and drop (and a menu for keyboard/touch), list/table with filters, calendar, My Tasks |
| **Approval workflow** | Members send finished work for review with notes (and evidence when required); managers/leads approve, reject (comment required) or reopen; assignees and managers are notified |
| **Daily reports** | One per person per day, draft with auto-save, per-task hours, evidence (files, screenshots, commit/PR links, video links), mood, blockers, edit before review, request changes / approve / reject, report comments, Today's Team Activity page, missing-report indicators, filters by person, project, date, team and status |
| **Files** | Validated uploads (type, size and magic-byte checks; SVG/HTML rejected), links, project folders, versions, soft delete / archive, previews, search and filters, per-file permission checks, "share with client" |
| **Milestones & timeline** | Milestone CRUD, progress calculated from tasks, Healthy / At risk / Delayed health, overdue highlighting, Gantt-style timeline, project calendar |
| **Time & workload** | Start/stop timer, manual entries, timesheet (daily + weekly), estimated vs actual hours, workload view with under / balanced / overloaded indicators |
| **Collaboration** | Task and report comments, @mention picker, project announcements, notification center (13 notification types), activity log |
| **Reports** | 11 charts/tables with project, person, department, status and date filters; CSV export for tasks, time entries and daily reports |
| **AI Insights** | `AIInsightsService` with a deterministic implementation: project summary, delay-risk score, stalled tasks, at-risk milestones, overloaded people, blocked dependencies, priority recommendations, missing-evidence reminders, manager actions. Each insight has a "Why am I seeing this?" panel with the rule and source data |

## Prerequisites

- **Node.js 20.19+** (22 LTS recommended) and npm
- **PostgreSQL 14+** running locally (or any reachable instance)

## Quick start

```bash
# 1. Install dependencies (this also runs `prisma generate`)
npm install

# 2. Create the database and a user
#    (adjust names/passwords to taste, then update DATABASE_URL below)
psql -U postgres -c "CREATE USER pulse WITH PASSWORD 'pulse' CREATEDB;"
psql -U postgres -c "CREATE DATABASE projectpulse OWNER pulse;"

# 3. Configure the environment
cp .env.example .env
#    Edit .env: set DATABASE_URL, and generate a real AUTH_SECRET:
#    openssl rand -base64 32

# 4. Create the tables
npm run db:deploy        # applies prisma/migrations (equivalent to `npx prisma migrate deploy`)

# 5. Load demo data
npm run db:seed

# 6. Start the app
npm run dev              # http://localhost:3000
```

To start from scratch at any time, run `npm run db:seed` again. It truncates every table and reloads the demo data.

### About the migration

`prisma/migrations/0001_init/migration.sql` was generated directly from `prisma/schema.prisma` using Prisma's naming
conventions, because the Prisma migration engine could not be downloaded in the sandbox where this project was built.
`npm run db:deploy` applies it normally. If you later run `npx prisma migrate dev` and Prisma reports drift against the
schema, regenerate the baseline once on your machine:

```bash
rm -rf prisma/migrations/0001_init
npx prisma migrate dev --name init
```

### Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Signs session tokens. **Required (32+ chars) in production.** |
| `APP_URL` | Base URL used in reset links. If it starts with `https://`, the session cookie gets the `Secure` flag |
| `STORAGE_DRIVER`, `UPLOAD_DIR`, `MAX_UPLOAD_MB` | File storage (`local` writes to `./uploads`) |
| `AI_PROVIDER` | `mock` (default, no key needed). `openai` / `anthropic` enable the adapter placeholder |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | Only used if you implement the LLM adapter |

## Demo accounts

Every demo account uses the password **`ProjectPulse#2026`**. These accounts are for development only. The seed script refuses to run when `NODE_ENV=production` (it wipes every table) unless you set `ALLOW_SEED_IN_PRODUCTION=yes`.

| Email | Role | Good for trying |
| --- | --- | --- |
| `superadmin@projectpulse.dev` | Super admin | Everything, including user and team administration |
| `admin@projectpulse.dev` | Admin | User management (cannot modify the Super Admin) |
| `mumtaz.pm@ppulse.dev` | Project manager | Manages Atlas; review queue, approvals, AI insights |
| `arjun.pm@projectpulse.dev` | Project manager | Manages Horizon (blocked work, at-risk milestones) |
| `mumtaz.lead@projectpulse.dev` | Team lead | Reviews team reports, updates tasks in her projects |
| `ybanti.lead@projectpulse.dev` | Team lead | Design team lead |
| `aisha@projectpulse.dev` | Team member | Personal dashboard, submit a daily report, log time |
| `ravi@projectpulse.dev` | Team member | Has a report with changes requested and a blocked task |
| `chloe@projectpulse.dev` | Team member | Has a task waiting for review, and a draft report today |
| `marcus@projectpulse.dev` | Team member | QA; blocked on a dependency |
| `client@ppulse.dev` | Client viewer | Read-only access to Atlas and the files shared with the client |
| `jordan@projectpulse.dev` | Team member (**suspended**) | Sign-in is refused |

Seed data: 1 organization, 4 departments, 3 teams, 12 users, 5 projects (Active ×2, Planning, On hold, Completed),
11 milestones, 28 tasks (blocked, overdue, review-pending, reopened, completed, with dependencies and checklists),
about 48 daily reports and 66 time entries (covering the last 10 workdays), 10 files (images, PDFs, text, commit/PR and video links), risks, announcements, comments and notifications.

## Try the core workflows

1. **Sign in** as `mumtaz.pm@ppulse.dev`.
2. **Create a project**: Projects → New project, pick team members (and a client viewer if you like).
3. **Add team members**: project → Team tab → "Add to this project".
4. **Create and assign a task**: project → Add task. Tick "Evidence required" to see the evidence rule.
5. **Sign in as `aisha@projectpulse.dev`** (assigned to the task): open it, attach a link or file under **Evidence**, then **Mark ready for review** with notes.
6. **Submit a daily report**: Daily reports → New. Add tasks and hours, attach evidence, wait for the "saved" indicator, submit.
7. **Sign back in as Sofia**: the notification bell shows the submitted report and the task awaiting review. Review the report (approve / request changes) and approve or reject the task.
8. **Log time**: Timesheet → start a timer or add a manual entry (report hours are synced into time entries automatically).
9. **Look at the results**: Dashboard, Reports (try the CSV exports), AI insights ("Why am I seeing this?" on any item).
10. **Check the guard rails**: as `aisha`, try `/reports` or `/admin/users` (redirected to *No access*). As `client@ppulse.dev` only the Atlas project and shared files are visible.

Password reset: use "Forgot your password?"; the reset link is printed in the terminal running `npm run dev`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (permissions and business rules, no database) |
| `npm run test:integration` | End-to-end workflow tests against a real database (see below) |
| `npm run db:deploy` | Apply migrations |
| `npm run db:migrate` | Create a new migration during development |
| `npm run db:seed` | Reset and load demo data |
| `npm run db:reset` | Drop, re-migrate and re-seed (needs the Prisma migration engine) |

## Tests

**Unit tests** (33): permission matrix, task completion and evidence rules, dependency cycles, milestone progress and health,
capacity and delay-risk scoring, report review rules, mentions, link classification, upload validation, CSV injection guard.

```bash
npm test
```

**Integration tests** (17) run the real server actions against PostgreSQL. Only the Next.js request context is replaced;
"who is signed in" is chosen by the test. They cover: login (wrong password, suspended, open-redirect protection), project creation
and membership, task creation with dependencies, the evidence/notes/approval/rejection workflow, milestone progress, blockers and
notifications, mentions, time entries and timers, daily report submit/review/edit-lock, hour syncing, AI insights, admin and archive permissions.

Use a **separate database**, because the seed script wipes it:

```bash
psql -U postgres -c "CREATE DATABASE projectpulse_test OWNER pulse;"
export DATABASE_URL="postgresql://pulse:pulse@localhost:5432/projectpulse_test"
npx prisma migrate deploy
npm run db:seed
npm run test:integration
```

The tests clean up after themselves and can be run repeatedly.

## Project structure

```
prisma/
  schema.prisma          26 models, 15 enums
  migrations/            SQL baseline
  seed.ts                Demo data (also writes sample files into uploads/seed)
src/
  proxy.ts               Redirects unauthenticated visitors to /login (Next.js 16 "proxy")
  app/
    (auth)/              Login, forgot password, reset password
    (app)/               Everything behind sign-in: dashboard, projects, tasks, board, daily-reports,
                         team-activity, files, timesheet, workload, reports, insights, notifications,
                         profile, admin, search
    api/files            Upload (POST) and list (GET); api/files/[id] authorised download
    api/export/[type]    CSV exports
  actions/               Server actions (all mutations): auth, projects, tasks, reports, time, files, admin, notifications
  lib/
    permissions.ts       Pure role/level rules (unit-tested)
    business.ts          Pure business rules (unit-tested)
    access.ts            Loads project/task/report access and builds scoped Prisma filters
    auth.ts              JWT cookie sessions (jose), requireUser helpers
    validators.ts        Zod schemas
    storage.ts           StorageService interface + local-disk implementation
    activity.ts          Activity log, notifications, milestone recalculation
    ai/                  AIInsightsService interface, deterministic implementation, LLM adapter placeholder
  components/            UI kit and feature components
tests/                   Unit tests; tests/integration holds the workflow tests
```

## How the important parts work

**Authorization.** `lib/permissions.ts` answers "what level does this person hold on this project?" (`manage`, `lead`, `member`,
`client`, or none) and what each level may do. `lib/access.ts` loads the facts from the database, and every server action,
route handler and page calls it. Lists are scoped in the query itself (`projectWhere`, `taskWhere`), so hidden data is never fetched.
Team members only see tasks assigned to or created by them; clients only see projects and files explicitly shared with them.

**Sessions.** Signed JWTs (HS256) in an HttpOnly, SameSite=Lax cookie, 7 days. The user is re-read from the database on every
request, so suspending an account takes effect immediately. Passwords are hashed with bcrypt (`bcryptjs`, cost 12).
Login failures are audited and throttled (5 failures per email in 15 minutes).

**Transactions.** Task review, report submission (including time-entry sync and notifications), project saves with member
changes, milestone recalculation and file registration each run in a single database transaction.

**Daily report hours.** When a report is submitted, its per-task hours are written as time entries linked to the report, and
re-synced if the report is edited before review, so timesheets, task hours and reports always agree.

**File storage.** Everything goes through `StorageService` (`src/lib/storage.ts`). To use S3 or Cloudinary, implement
`put/get/delete` and return it from `getStorage()`. Downloads are served by `/api/files/[id]` after a permission check, with
`nosniff` and a restrictive CSP.

**AI insights.** `AIInsightsService` (`src/lib/ai/types.ts`) has `generateProjectSummary`, `detectStalledTasks`,
`assessMilestoneHealth`, `recommendPriorities`, `analyzeTeamWorkload` plus helpers for evidence, dependencies and manager actions.
The default implementation is rule-based and every insight carries its reason and source records. `llm-adapter.ts` is a
placeholder showing where a real model client plugs in; nothing calls it unless `AI_PROVIDER` and a key are set.

**Notifications.** Written in-app by `notify()` in `lib/activity.ts`. A `channels` array there is the hook for email: push a
function that sends mail and every notification will fan out to it. Deadline and overdue notifications are created lazily when a
user opens their dashboard (at most one per task per day).

## Verification status

Done in the build environment:

- TypeScript compiles with no errors, and `next build` completes with no warnings.
- 33 unit tests and 17 database-backed workflow tests pass (the latter twice in a row).
- Every page was requested as several roles against the seeded database; role redirects and data scoping were checked
  (for example members cannot reach Reports or Admin, clients see only shared files, members do not see other people's tasks).
- Real sign-in over HTTP against the production build: wrong password, suspended account and valid credentials, session cookie
  set, protected page loads with it, and is redirected without it.

Not done, so please look for yourself:

- **No browser-based visual or interaction testing.** Layouts, the mobile drawer, Kanban drag and drop, the timer display,
  charts and the upload widget were built carefully but have not been clicked through in a real browser here.
- Prisma's migration engine was unavailable, so the SQL baseline was generated from the schema (see above) and applied with `psql`.
- Email delivery, S3/Cloudinary and a real LLM were not exercised, as they are intentionally stubbed.

## Deferred and known limitations

- **Email notifications** (hook exists, no sender), **S3/Cloudinary** adapter (interface only), **real LLM** adapter (placeholder).
- Organization-level settings screen and storage usage dashboard for Super Admins (users, departments and teams are manageable).
- Real-time updates (pages refresh after actions; there is no live push).
- Timeline shows dependencies as text ("After: …") rather than drawn arrows; bars are not draggable.
- Search uses case-insensitive `LIKE` queries, not full-text search.
- Virus scanning of uploads, SSO / two-factor authentication, per-user notification preferences, recurring tasks, bulk import.
- Rate limiting is limited to login throttling; add edge/API rate limiting in production.
- Local `uploads/` is not suitable for multi-instance or serverless hosting. Use the storage adapter.

## Production deployment checklist

1. Set a strong `AUTH_SECRET` (32+ random characters) and an `https://` `APP_URL` (turns on Secure cookies).
2. Use a managed PostgreSQL with backups; run `npx prisma migrate deploy` during release. **Never run `db:seed` against production.**
3. Create the first Super Admin by script or SQL instead of the demo seed, and make sure no demo accounts exist.
4. Replace local file storage with S3/Cloudinary via `StorageService`, and consider virus scanning on upload.
5. Send real email: add a channel to `lib/activity.ts` for notifications and replace the console log in `forgotPasswordAction`.
6. Put the app behind HTTPS with a reverse proxy/CDN, add rate limiting, and set security headers (CSP, HSTS).
7. Enable monitoring and error reporting; review the `LoginAudit` and `ActivityLog` tables as part of your audit process.
8. Schedule a job to create deadline/overdue notifications if you want them without users opening the dashboard.
9. If you adopt a real LLM for insights, keep the deterministic findings as grounding and send only data the user may see.
