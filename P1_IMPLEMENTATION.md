# P1 Implementation — Unlock Underused Equipment and Spaces

This document summarizes the P1 features implemented on top of the existing P0 application, the files changed, new database migrations, setup requirements, and how to verify each feature.

No secrets are recorded here. Live Supabase, Storage, and email behavior have NOT been tested end-to-end in this environment.

## Implemented P1 features

### P1.1 Overdue tracking and reminders (visibility)
- Overdue bookings are computed from the real `bookings.expected_return_at` timestamp and the `Checked Out` status.
- Cancelled, rejected, returned, and completed bookings are never classified as overdue.
- Overdue badge shown on:
  - Manager dashboard (`src/pages/ManagerPage.tsx`) — overdue card + count.
  - My bookings / requests (`src/pages/BookingsPage.tsx`) — per-booking "Overdue" badge.
  - Resource detail (`src/pages/ResourceDetailPage.tsx`) — per-booking "Overdue" badge + expected return time.
- Overdue count is a summary card on the manager dashboard with a link to all bookings.
- Missing/invalid `expected_return_at` handled safely (not treated as overdue).

**Reminder architecture:** No scheduled-execution mechanism exists in the project, and no Supabase Edge Function/cron is configured. A client-side timer is NOT used as a substitute for a backend job. A secure server-side reminder design is documented below (P1.6 email section) and requires provider credentials + a deployed scheduler before it can send anything. Reminder delivery is therefore NOT implemented.

### P1.2 Resource image uploads
- New migration `supabase/migrations/004_add_resource_image_url.sql` adds an optional `image_url text` column to `public.resources` (not applied automatically).
- The `Database` type in `src/lib/supabase.ts` already includes `image_url` on resources.
- Image upload control already existed on resource create/edit pages (Supabase Storage bucket `resource-images`, public URL, file type/size validation, upload progress text, preview).
- Images now render on resource cards (`src/pages/ResourcesPage.tsx`) and resource detail pages (`src/pages/ResourceDetailPage.tsx`) with a "No image" fallback.
- Storage bucket `resource-images` must be created manually in Supabase and configured for public read (see Manual setup).

### P1.3 Advanced resource discovery
- `src/pages/ResourcesPage.tsx`:
  - Debounced keyword search (300 ms).
  - Category and resource-type filters.
  - Sorting: newest first, name (A-Z), capacity (high to low).
  - Active-filter chips with per-filter clear and a global reset.
  - Matching-resource count.
  - Empty, loading, and error states preserved.
- Filters combine (search AND category AND type) rather than overwriting each other.

### P1.4 Waiting list
- New migration `supabase/migrations/005_waiting_list.sql` creates `public.resource_waiting_list`:
  - `id`, `resource_id` (FK → resources), `user_id` (FK → profiles), `status` (`active`/`fulfilled`/`cancelled`/`expired`), `created_at`, `updated_at`.
  - Partial unique index `(resource_id, user_id) WHERE status = 'active'` prevents duplicate active entries per user per resource.
  - Indexes on `(user_id, status)` and `(resource_id, status)`.
  - RLS: users select/update their own entries; managers/admins select all; insert restricted to `user_id = auth.uid()`; delete blocked.
- `src/hooks/useWaitingList.ts` — load my entries, join a resource, leave (cancel) an entry.
- `src/pages/WaitingListPage.tsx` — join a waiting list, view active/past entries, leave an entry.
- Route `/waiting-list` added under `ProtectedRoute`; nav link for student/manager/admin.
- One active entry per user per resource is enforced at the database level (partial unique index).
- Queue position is NOT displayed because no deterministic queue-ordering rule exists in the schema.
- Automatic notification when a resource becomes available is NOT implemented (no scheduler/email provider). Documented as a limitation.

### P1.5 Enhanced manager analytics
- `src/pages/ManagerPage.tsx`:
  - Utilization card: percentage of active resources currently checked out (clearly labeled as a snapshot, not a precise utilization formula).
  - Recent booking activity (last 30 days) with borrower, resource, status, time.
  - Incident outcomes: open/under review, resolved, total counts.
  - Existing cards retained: total/active resources, pending requests, active bookings, overdue bookings, open incidents.
  - Links to booking review, resource management, incident review, audit history.

### P1.6 Email notifications
- No email provider credentials or deployed backend exist in this environment. Email delivery is NOT implemented and NOT claimed to work.
- A secure design is documented: trigger emails only from a server-side mechanism (Supabase Edge Function or equivalent), read credentials only from server-side env vars, never expose provider secrets to the browser, validate triggering event + recipient, idempotency key to avoid duplicates on retry, log failures without leaking secrets, respect notification preferences if they exist.
- Required env vars (example names, no values): `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_BASE_URL`.
- Events that could trigger email: booking requested/approved/rejected/cancelled, checkout/return recorded, overdue reminder, incident update, waiting-list availability alert.

### P1.7 Responsive UI and accessibility polish
- `src/components/Navbar.tsx`: added a mobile hamburger menu showing role-based links and sign-out; role badge and user identity remain visible on mobile.

## Files changed

Modified:
- `src/App.tsx` — added `/waiting-list` route under ProtectedRoute; imported `WaitingListPage`.
- `src/components/Navbar.tsx` — added Waiting List nav item (student/manager/admin); mobile menu; new icons.
- `src/pages/ResourcesPage.tsx` — debounced search, sort, active-filter chips, reset, image rendering.
- `src/pages/ResourceDetailPage.tsx` — render resource image with fallback.
- `src/pages/ManagerPage.tsx` — utilization, recent activity, incident trends cards; imports.
- `src/hooks/useWaitingList.ts` — new hook (created).
- `src/pages/WaitingListPage.tsx` — new page (created).
- `src/lib/supabase.ts` — added `resource_waiting_list` to the `Database` type.
- `src/lib/p1-implementation.test.ts` — new tests (created).

Created:
- `supabase/migrations/004_add_resource_image_url.sql`
- `supabase/migrations/005_waiting_list.sql`
- `src/hooks/useWaitingList.ts`
- `src/pages/WaitingListPage.tsx`
- `src/lib/p1-implementation.test.ts`
- `P1_IMPLEMENTATION.md` (this file)

## Database changes

Migration `004_add_resource_image_url.sql`:
- `ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS image_url text;`
- Partial index on `image_url` where not null.

Migration `005_waiting_list.sql`:
- Creates `public.resource_waiting_list` with FKs, check constraint on status, `set_updated_at` trigger, partial unique index for one active entry per user per resource, RLS policies (least privilege), grants via RLS only (no service role).

Neither migration is executed automatically. Apply manually to the existing Supabase project after review.

## Supabase Storage setup (P1.2)
- Create a private/public bucket named `resource-images` in Supabase Storage.
- The frontend calls `supabase.storage.from("resource-images").upload(...)` then `getPublicUrl(...)`.
- For images to be publicly viewable without auth, configure the bucket for public read access and add an appropriate Storage policy. Do not make the bucket publicly writable.
- Object path pattern: `resource-images/<uuid>.<ext>`.

## Email provider setup (P1.6)
- Not configured. Requires: deployed backend/Edge Function, provider credentials in server-side secret storage, and the env vars listed above. Do not commit credentials.

## How to run
- `npm run dev` — start Vite dev server.
- `npm run build` — TypeScript check + production Vite build.
- `npm run test` — Vitest unit tests.
- `npm run lint` — oxlint.

## How to verify each feature
- Overdue: create a Checked Out booking with a past `expected_return_at` (via DB/seed, not frontend); confirm "Overdue" badge appears on manager dashboard, bookings page, and resource detail. Confirm non-Checked-Out statuses do not show overdue.
- Images: after applying migration 004 and configuring the `resource-images` bucket, create/edit a resource and upload an image; confirm the image appears on the card and detail page with a fallback when none exists.
- Discovery: combine search + category + type filters; change sort; clear filters; confirm empty state when nothing matches.
- Waiting list: after applying migration 005, sign in, join a waiting list for a resource, confirm the entry appears under active entries; attempt to join the same resource again (should be blocked by the unique index); leave the list and confirm it moves to past/cancelled.
- Analytics: manager dashboard shows real counts; recent activity reflects bookings created in the last 30 days.

## Known limitations
- Live Supabase RLS/RPC/Storage/email behavior has not been verified end-to-end.
- Waiting-list availability notifications and overdue reminders require a backend scheduler and email provider; not implemented.
- Image upload depends on the `resource-images` bucket existing and being configured; without it, uploads fail at runtime but the UI remains functional.
- Utilization is a snapshot percentage, not a precise time-based utilization formula.
- The `bookings` row type in `src/lib/supabase.ts` contains a non-schema `image_url` field (pre-existing); it is unused.

## P1 verdict
P1 PARTIALLY COMPLETE, WITH EXPLICIT REMAINING TASKS — all UI/features that can be built without external infrastructure are implemented and locally verified; email delivery, waiting-list notifications, and overdue reminders require Supabase Storage configuration, a deployed scheduler/backend, and email provider credentials before they can be live-tested.
