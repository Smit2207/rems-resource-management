# DATABASE MIGRATION GUIDE

## Resource Sharing Platform — Database Migration Guide

This guide explains how to use the rewritten migration sequence for:

1. **Fresh database** — new Supabase project (use 001, 002, 003)
2. **Existing database** — live production database (use 004)

---

## Migration Sequence

| Order | File | Purpose | When to Use |
|-------|------|---------|-------------|
| 1 | `supabase/migrations/001_initial.sql` | Complete foundational schema, constraints, indexes, RLS policies, functions | Fresh projects only |
| 2 | `supabase/migrations/002_seed.sql` | Idempotent seed data (4 demo users, categories, resources, bookings) | Fresh projects only |
| 3 | `supabase/migrations/003_security_hardening.sql` | Function execution permissions + table-level privilege hardening | Fresh projects only (after 001+002) |
| 4 | `supabase/migrations/004_upgrade_existing.sql` | Forward-only security hardening for **existing** live databases | Existing databases only |

**Important:** Do NOT run 001/002/003 on an existing live database. Those will fail because tables already exist. Use **004_upgrade_existing.sql** instead.

---

## Section A: Fresh Database (New Supabase Project)

### Prerequisites
- A new, empty Supabase project
- Access to the Supabase SQL Editor
- No existing application tables

### Steps

1. Open the Supabase SQL Editor for your project
2. Copy and paste the entire contents of `supabase/migrations/001_initial.sql`
3. Click **Run** — wait for success
4. Copy and paste `supabase/migrations/002_seed.sql`
5. Click **Run** — wait for success
6. Copy and paste `supabase/migrations/003_security_hardening.sql`
7. Click **Run** — wait for success
8. Copy and paste `supabase/migrations/post_migration_verify.sql`
9. Click **Run** — verify all checks pass

### Expected Result
- 7 tables created with RLS enabled
- 11 SECURITY DEFINER functions created
- `bookings_no_overlap` EXCLUDE constraint active
- Function execution privileges restricted to `authenticated`
- `audit_write` not directly callable by any application role
- Seed data: 4 demo users, 4 categories, 3 resources, 2 demo bookings

---

## Section B: Existing Database (Live Production)

### Prerequisites
- Existing Supabase project with application tables already created
- Access to the Supabase SQL Editor
- Database may have been created using 001_initial.sql (possibly partially applied)

### Before You Begin (Critical)

**Save a manual recovery snapshot** by running these read-only queries in the SQL Editor and saving the results:

```sql
-- Save current function definitions
SELECT pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('create_booking', 'report_incident', 'resolve_incident', 'audit_write', 'cancel_booking');

-- Save current RLS policies
SELECT polname, polrelid::regclass, pg_get_expr(polqual, polrelid), pg_get_expr(polwithcheck, polrelid)
FROM pg_policy
JOIN pg_class ON pg_class.oid = polrelid
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE pg_namespace.nspname = 'public';

-- Save current EXECUTE privileges
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
ORDER BY routine_name, grantee;

-- Save EXCLUDE constraint definition
SELECT pg_get_constraintdef(c.oid)
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public' AND t.relname = 'bookings' AND conname = 'bookings_no_overlap';
```

### Preflight Checks (Read-Only)

Run these before applying 004:

```sql
-- Verify all 7 tables exist
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'resource_categories', 'resources', 'bookings', 'incidents', 'notifications', 'audit_logs')
ORDER BY table_name;

-- Verify RLS is enabled on all tables
SELECT relname, relrowsecurity
FROM pg_class
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE pg_namespace.nspname = 'public'
  AND relname IN ('profiles', 'resource_categories', 'resources', 'bookings', 'incidents', 'notifications', 'audit_logs')
  AND relkind = 'r'
ORDER BY relname;

-- Verify bookings_no_overlap exclusion constraint exists
SELECT conname, contype
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public' AND t.relname = 'bookings' AND conname = 'bookings_no_overlap';

-- Verify key functions exist
SELECT proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('create_booking', 'report_incident', 'resolve_incident', 'audit_write', 'cancel_booking')
ORDER BY proname;
```

**Stop conditions:** If any preflight check fails (missing tables, missing constraint, missing functions), **do not proceed**. Report the missing objects first.

### Apply Migration 004

1. Copy the entire contents of `supabase/migrations/004_upgrade_existing.sql`
2. Paste into the Supabase SQL Editor
3. Read through it once to confirm you understand what it changes
4. Click **Run** — wait for success
5. The migration is transactional: if any statement fails, the entire script rolls back

### Post-Migration Verification

Run `supabase/migrations/post_migration_verify.sql` and confirm all checks pass:

| Check | Expected Result |
|-------|-----------------|
| No PUBLIC/anon EXECUTE on RPCs | Zero rows |
| `authenticated` has EXECUTE on app RPCs | Rows for all RPCs except `audit_write` |
| `audit_write` has no EXECUTE grants | Zero rows |
| `bookings_no_overlap` constraint exists | One row with `contype = 'x'` |
| Correct RLS policies present | Old permissive policies removed, new restrictive ones present |

---

## Section C: Verification After Migration

Run the post-migration verification script:

```sql
-- File: supabase/migrations/post_migration_verify.sql
```

See the file for the complete set of verification queries and expected results.

---

## Section D: Rollback / Recovery

### If Migration 004 Fails Mid-Way

PostgreSQL transactions are atomic — if any statement in 004 fails, the entire script rolls back automatically. No manual rollback needed.

### If Migration Completes But Causes Issues

Use `supabase/migrations/rollback_recovery.sql` to restore previous policies and permissions.

### What Can Be Reversed

| Change | Reversible | How |
|--------|-----------|-----|
| RLS policies | Yes | Drop new policies, recreate old ones |
| Function definitions | Yes | `CREATE OR REPLACE FUNCTION` with original bodies |
| Function permissions | Yes | Re-GRANT to PUBLIC/anon, REVOKE from authenticated |
| `bookings_no_overlap` constraint | N/A | **Never touched** — preserved throughout |

### What Cannot Be Reversed

- Data inserted by RPC calls after migration (booking requests, incidents, etc.)
- Row-level data changes made after migration

### Recovery Files

- `supabase/migrations/rollback_recovery.sql` — SQL to restore previous policies and permissions
- `PRE_003_RECOVERY_NOTES.md` — Manual recovery snapshot instructions

---

## Section E: Frontend Compatibility

The rewritten database is fully compatible with the existing frontend. No frontend code changes are required.

### Preserved RPC Signatures

| RPC | Signature | Frontend File |
|-----|-----------|---------------|
| `create_booking` | `(uuid, timestamptz, timestamptz) → uuid` | `src/hooks/useBookings.ts:12` |
| `decide_booking` | `(uuid, text, text) → void` | `src/hooks/useBookings.ts:26` |
| `record_checkout` | `(uuid, text, text[], timestamptz) → void` | `src/hooks/useBookings.ts:40` |
| `record_return` | `(uuid, text, text[], text) → void` | `src/hooks/useBookings.ts:55` |
| `confirm_return` | `(uuid) → void` | `src/hooks/useBookings.ts:65` |
| `report_incident` | `(uuid, text, text) → uuid` | `src/hooks/useBookings.ts:76` |
| `resolve_incident` | `(uuid, text, text) → void` | `src/hooks/useBookings.ts:90` |
| `cancel_booking` | `(uuid) → void` | `src/hooks/useBookings.ts:99` |
| `mark_notification_read` | `(uuid) → void` | `src/hooks/useIncidents.ts:53` |

### Preserved Table Queries

| Table | Query Type | Frontend File |
|-------|-----------|---------------|
| `profiles` | SELECT own | `src/lib/auth.ts:38` |
| `resources` | SELECT all | `src/hooks/useResources.ts:17` |
| `resource_categories` | SELECT all | `src/hooks/useResources.ts:18` |
| `bookings` | SELECT with relations | `src/hooks/useBookings.ts:107,132` |
| `incidents` | SELECT with relations | `src/hooks/useIncidents.ts:16` |
| `notifications` | SELECT all | `src/hooks/useIncidents.ts:41` |

### Frontend Change Already Applied

`src/hooks/useIncidents.ts` already calls `supabase.rpc("mark_notification_read", ...)` instead of direct UPDATE on `notifications`. This matches the new migration where direct UPDATE on notifications is blocked.

---

## Section F: Manual Test Plan

Run these tests against a test (non-production) database:

| # | Test | Expected Result |
|---|------|-----------------|
| 1 | Anonymous visitor attempts RPC call | Error: function does not exist or permission denied |
| 2 | Authenticated borrower browses resources | Sees active resources only |
| 3 | Ineligible borrower requests booking | Error: department/training/year mismatch |
| 4 | Borrower approves their own booking | Error: not authorized |
| 5 | Two overlapping booking requests | Second request rejected by EXCLUDE constraint |
| 6 | Resource owner edits another owner's resource | Error: RLS blocks update |
| 7 | User reads another user's notification | Error: RLS blocks select |
| 8 | User changes role to admin via profile update | Error: RLS blocks update on role field |
| 9 | Normal user inserts into audit_logs | Error: policy blocks insert |
| 10 | Manager reads audit logs | Success: can see all entries |
| 11 | Checkout → Return → Confirm workflow | Booking reaches 'Completed' status |

---

## Section G: Support

If migration 004 fails:
1. Copy the exact error message
2. Run the preflight checks again to confirm prerequisites
3. Do not attempt to manually patch the database
4. Restore from your pre-migration snapshot using `rollback_recovery.sql`
