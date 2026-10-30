# DATABASE CHANGELOG

## Resource Sharing Platform — Database Changes

## Version 004 (Current) — Security Hardening

### File: `supabase/migrations/004_upgrade_existing.sql`

**Purpose:** Forward-only security hardening for existing live databases.

### Changes

#### A. Row Level Security (RLS) Policy Fixes

| Table | Policy Removed | Policy Added | Effect |
|-------|---------------|--------------|--------|
| `audit_logs` | `audit_logs_insert_authenticated` (WITH CHECK true) | `audit_logs_insert_none` (WITH CHECK false) | Prevents direct audit log forgery |
| `audit_logs` | `audit_logs_select_all` (USING true) | `audit_logs_select_manager_admin` (is_manager_or_admin()) | Restricts audit log reads to managers/admins |
| `profiles` | `profiles_select_all` (USING true) | `profiles_select_own_or_manager_admin` (id = auth.uid() OR is_manager_or_admin()) | Users read own profile; managers/admins read all |
| `notifications` | `notifications_update_own_read` (allowed title/message changes) | `notifications_update_none` (USING false) | Prevents notification tampering |
| `profiles` | — | `profiles_insert_none` (WITH CHECK false) | Blocks direct profile inserts |
| `profiles` | — | `profiles_delete_none` (USING false) | Blocks direct profile deletes |
| `notifications` | — | `notifications_insert_none` (WITH CHECK false) | Blocks direct notification inserts |
| `notifications` | — | `notifications_delete_none` (USING false) | Blocks direct notification deletes |
| `audit_logs` | — | `audit_logs_update_none` (USING false) | Blocks audit log updates |
| `audit_logs` | — | `audit_logs_delete_none` (USING false) | Blocks audit log deletes |

#### B. New Helper Function

- `public.is_manager_or_admin()` — SECURITY DEFINER, non-recursive role check used by RLS policies to avoid self-referencing the `profiles` table

#### C. Fixed Functions

| Function | Fix |
|----------|-----|
| `create_booking` | Added `FOR UPDATE` on borrower profile SELECT (serializes concurrent booking creation, fixes active-booking-limit race condition); NULL-safe training validation using `coalesce(training_completed, '{}'::text[])` |
| `report_incident` | Added caller authorization check (borrower, resource owner, or manager/admin only) |
| `resolve_incident` | Fixed invalid `SELECT i.*, b.resource_id INTO v_incident, v_resource_id` — now uses separate SELECT INTO for incident row and booking resource_id |
| `decide_booking`, `record_checkout`, `record_return`, `confirm_return`, `cancel_booking` | Added explicit `if auth.uid() is null then raise exception` authentication preconditions |

#### D. New Function

- `public.mark_notification_read(p_notification_id uuid)` — SECURITY DEFINER RPC that sets `read = true` only where `user_id = auth.uid()`. Replaces direct UPDATE on `notifications` table.

#### E. Function Execution Permissions

| Function | Before | After |
|----------|--------|-------|
| All 10 RPCs | EXECUTE granted to PUBLIC (=X/postgres) | REVOKED from PUBLIC and anon; GRANTED to authenticated only |
| `audit_write` | EXECUTE granted to PUBLIC/anon/authenticated | REVOKED from all application roles; not granted to any role (internal helper only) |

#### F. Table-Level Privileges

| Table | Before | After |
|-------|--------|-------|
| All 7 tables | ALL privileges granted to PUBLIC/anon | ALL revoked from PUBLIC/anon; SELECT granted to authenticated only |

### Preserved (Not Changed)

- `bookings_no_overlap` EXCLUDE constraint — untouched, contype='x'
- `cancel_booking` function — already exists in live DB, not recreated
- All table structures — no drops or alterations
- All existing data — preserved

---

## Version 003 (Previous) — Security Hardening

### File: `supabase/migrations/003_security_hardening.sql`

**Purpose:** Function execution permissions + table-level privilege hardening.

**Status:** Superseded by 004 for existing databases. Used in fresh project sequence (001→002→003).

### Changes

- REVOKE EXECUTE from PUBLIC and anon on all RPCs
- GRANT EXECUTE to authenticated on frontend RPCs
- REVOKE ALL table privileges from PUBLIC/anon
- GRANT SELECT to authenticated on all tables

---

## Version 002 (Previous) — Seed Data

### File: `supabase/migrations/002_seed.sql`

**Purpose:** Idempotent seed data for demo accounts and resources.

### Seed Data

| User | Email | Role |
|------|-------|------|
| Alice Chen | alice@college.edu | student |
| Bob Rivera | bob@college.edu | manager |
| Carol Mbeki | carol@college.edu | manager |
| Dave Okoro | dave@college.edu | admin |

| Resource | Owner | Type | Status |
|----------|-------|------|--------|
| Olympus Microscope – Lab 301 | Bob | equipment | active |
| Projector Epson EB-X51 | Bob | equipment | active |
| Seminar Hall A | Bob | space | active |

**Demo bookings:**
- Approved booking on microscope (Alice, next week Tue 10:00-12:00)
- Checked Out booking on projector (Alice, overdue)

**Demo categories:**
- Lab Equipment, Meeting Room, AV Equipment, Space

---

## Version 001 (Previous) — Foundational Schema

### File: `supabase/migrations/001_initial.sql` (corrected)

**Purpose:** Complete database schema with all security fixes baked in.

### Tables Created

| Table | Key Columns | RLS |
|-------|-------------|-----|
| `profiles` | id, email, role, institution, department, year_of_study, training_completed | Enabled |
| `resource_categories` | id, name, slug, description | Enabled |
| `resources` | id, owner_id, category_id, name, type, location, status | Enabled |
| `bookings` | id, resource_id, borrower_id, status, start_time, end_time | Enabled |
| `incidents` | id, booking_id, reported_by, type, description, status | Enabled |
| `notifications` | id, user_id, type, title, message, read | Enabled |
| `audit_logs` | id, actor_id, action, entity_type, entity_id, reason, metadata | Enabled |

### Functions Created

`handle_new_user`, `set_updated_at`, `is_manager_or_admin`, `audit_write`, `create_booking`, `decide_booking`, `record_checkout`, `record_return`, `confirm_return`, `report_incident`, `resolve_incident`, `cancel_booking`, `mark_notification_read`

### Key Constraints

| Constraint | Table | Effect |
|------------|-------|--------|
| `bookings_end_after_start` | bookings | end_time > start_time |
| `bookings_no_overlap` | bookings | EXCLUDE prevents overlapping Approved/Checked Out bookings |
| `profiles.role check` | profiles | role IN ('student','manager','admin') |
| `resources.type check` | resources | type IN ('equipment','space') |
| `resources.status check` | resources | status IN ('active','disabled','maintenance') |
