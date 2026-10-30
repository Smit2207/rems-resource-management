# REMS — Resource Equipment Management and Sharing System

A full-stack platform for sharing equipment and spaces across an institution. Built with React, TypeScript, Vite, Tailwind CSS, React Router, and Supabase (Auth, PostgreSQL, RLS, RPC functions, Storage).

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Routing | React Router |
| Forms | react-hook-form + zod |
| Icons | lucide-react |
| Backend | Supabase (Auth, PostgreSQL, RLS, RPC functions, Storage) |
| Styling | Tailwind CSS |
| Testing | Vitest + @testing-library/react |
| Lint | oxlint |

## Project Structure

```
src/
  lib/          supabase client, auth helpers, validations, utils, eligibility, matchmaker, alternatives
  hooks/        useAuth, useResources, useBookings, useIncidents, useResourceLifecycle, useWaitingList
  pages/        Auth, resources, bookings, incidents, notifications, waiting list, manager, audit, profile
  components/   PageLayout, Navbar, ProtectedRoute, ImageUpload, StatusBadge, Card, Common
supabase/migrations/
  001_initial.sql          Base schema (profiles, resources, bookings, incidents, notifications, audit_logs, RLS)
  002_seed.sql             Seed data
  003_security_hardening.sql  RLS policies and function grants
  004_upgrade_existing.sql    Forward-only security hardening for existing DBs
  005_p1_schema.sql          image_url column, waiting_list table, waiting list RPCs
  006_resource_lifecycle_and_matchmaker.sql  lifecycle_state, tags, helper RPCs
  007_resource_lifecycle_integration.sql  lifecycle triggers, booking RPC integration
  post_migration_verify.sql  Read-only verification queries
```

## Eight Features

| # | Feature | Status |
|---|---------|--------|
| 1 | User Authentication (login, register, logout, session persistence, profile) | Complete |
| 2 | Resource Management (browse, search, filter, sort, create, edit, my resources) | Complete |
| 3 | Booking System (create request, approve/reject, checkout, return, confirm, cancel) | Complete |
| 4 | Incident Management (report, review, resolve) | Complete |
| 5 | Notifications (list, mark as read) | Complete |
| 6 | Waiting List (join active entry, leave/cancel) | Complete |
| 7 | Resource Images (upload to Supabase Storage, public URL display) | Complete* |
| 8 | Manager Dashboard & Analytics (overdue tracking, utilization, stats, audit logs) | Complete |

\* Feature 7 requires the `resource-images` Storage bucket to be created manually in the Supabase Dashboard (see Database Setup below).

## Local Setup

### Prerequisites

- Node.js 18+
- A Supabase project (URL and anon key)

### 1. Clone and install

```bash
git clone <repository-url>
cd REMS
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in your Supabase credentials:

```bash
cp .env.example .env.local
```

Edit `.env.local`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Only the Supabase public URL and anon key are used in browser code. Never add the service-role key to `.env.local` or commit it.

### 3. Run development server

```bash
npm run dev
```

Open http://localhost:5173

### 4. Run checks

```bash
npm run build       # Production build (Vite)
npx tsc --noEmit    # TypeScript type check
npx oxlint          # Lint
npx vitest run      # Unit tests (127 tests)
```

## Database Setup

### Migration files

Migration SQL files live in `supabase/migrations/`. Apply them in order:

1. `001_initial.sql`
2. `002_seed.sql`
3. `003_security_hardening.sql`
4. `004_upgrade_existing.sql`
5. `005_p1_schema.sql`
6. `006_resource_lifecycle_and_matchmaker.sql`
7. `007_resource_lifecycle_integration.sql`

### Applying migrations

1. Open the Supabase SQL Editor for your project.
2. Before running any migration, run the read-only inspection queries from `post_migration_verify.sql` to verify current database state.
3. Copy each migration file's contents into the SQL Editor and run them **in order** (001 → 007).
4. Do not skip migrations. Do not rerun 001–005 as part of a 006/007 deployment.
5. After 006 and 007, run `post_migration_verify.sql` again to confirm all objects exist.

### Storage bucket

The `resource-images` Storage bucket is **not** created by any migration. It must be created manually:

1. In the Supabase Dashboard, go to Storage → Create Bucket.
2. Name: `resource-images`
3. Public bucket: Yes (public read)
4. File size limit: as needed (e.g., 10 MB)
5. Allowed MIME types: image/*

Then run the storage policy SQL (from the corrected Deployment Readiness Checklist) in the SQL Editor to configure upload/select/update/delete policies.

### Live database state

Migration 006 is verified applied (`resources.lifecycle_state` and `resources.tags` columns exist; helper RPCs exist). Migration 007 (lifecycle triggers) has **not** been confirmed as applied against a live database. The trigger design in 007 has been fixed to be rerun-safe and to trust server-side booking workflows via `SET LOCAL public.lifecycle_trusted_workflow`.

## Deployment

### Build command

```bash
npm run build
```

Output goes to `dist/`.

### Environment variables (hosting provider)

Configure the same variables as `.env.local` in your hosting provider (Vercel, Netlify, etc.):

| Variable | Value | Required |
|----------|-------|----------|
| `VITE_SUPABASE_URL` | Your Supabase project URL | Yes |
| `VITE_SUPABASE_ANON_KEY` | Your Supabase anon (publishable) key | Yes |

### Supabase Auth redirect URLs

Add your production URL to Supabase Auth → URL Configuration → Redirect URLs:

```
https://your-app.vercel.app/auth/callback
https://your-app.vercel.app/
```

### Secrets

- Never expose the Supabase service-role key in frontend code or public environment variables.
- `.env.local` is gitignored and must not be committed.

## GitHub Repository

### Before committing

1. Confirm `.env.local` is listed in `.gitignore` (it is).
2. Confirm no service-role keys or credentials are in source files.
3. Run `npm run build`, `npx tsc --noEmit`, `npx oxlint`, `npx vitest run` — all should pass.

### Commit

```bash
git add .
git commit -m "chore: prepare REMS for submission"
```

### Push (only if authorized)

```bash
git remote add origin <repository-url>
git branch -M main
git push -u origin main
```

Do not push without explicit authorization. If no GitHub credentials or authorized repository are available, the repository is ready locally for push when credentials become available.

## Testing Checklist (Manual)

All manual tests are NOT RUN until executed against a live environment:

- [ ] Registration, login, logout, session persistence
- [ ] Role-based authorization (manager/admin vs borrower)
- [ ] Resource create, edit, browse, my resources
- [ ] Image upload and display
- [ ] Booking create, approve/reject, checkout, return, confirm, cancel
- [ ] Booking overlap protection
- [ ] Incident report, review, resolve
- [ ] Notifications list and mark read
- [ ] Waiting list join and leave
- [ ] Manager dashboard stats and overdue tracking
- [ ] Audit log viewing
- [ ] Responsive layout and browser console errors