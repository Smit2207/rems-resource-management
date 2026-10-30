# PRE_003_RECOVERY_NOTES

**Purpose:** Manual recovery snapshot reference before applying migration `003_security_hardening.sql`.
**Status:** Read-only documentation. These notes are NOT a complete database backup.

## WARNING

These notes capture the **expected** schema based on migration files. They do NOT capture:
- Actual data rows in your tables
- Whether migration `001_initial.sql` completed fully on your project
- Any manual changes made directly in the Supabase SQL Editor
- Custom indexes, triggers, or extensions beyond what the migration files define

**Run the SQL queries below in the Supabase SQL Editor to capture your actual database state before applying `003_security_hardening.sql`. Save the query results as your recovery reference.**

---

## 1. Expected Schema (from 001_initial.sql)

### Tables (7)

| Table | Key Columns |
|-------|-------------|
| `public.profiles` | id (PK -> auth.users.id), email, role, institution, department, year_of_study, student_staff_id, training_completed (text[]), created_at |
| `public.resource_categories` | id (PK), name (unique), slug (unique), description |
| `public.resources` | id (PK), owner_id (-> profiles.id), category_id (-> resource_categories.id), name, type, location, capacity, eligibility_department, eligibility_min_year, required_training, training_required, supervision_required, usage_rules, deposit_amount, deposit_conditions, status, created_at, updated_at |
| `public.bookings` | id (PK), resource_id (-> resources.id), borrower_id (-> profiles.id), status, start_time, end_time, rejection_reason, requested_at, decided_at, decided_by, checkout_at, checkout_by, checkout_condition, accessories_included, expected_return_at, return_at, return_by, return_condition, missing_accessories, damage_notes, created_at, updated_at |
| `public.incidents` | id (PK), booking_id (-> bookings.id), reported_by (-> profiles.id), type, description, status, reviewed_by, reviewed_at, resolution_notes, created_at |
| `public.notifications` | id (PK), user_id (-> profiles.id), type, title, message, related_resource_id (-> resources.id), related_booking_id (-> bookings.id), read, created_at |
| `public.audit_logs` | id (PK), actor_id (-> profiles.id, ON DELETE SET NULL), action, entity_type, entity_id, reason, metadata (jsonb), created_at |

### Extensions
- `pgcrypto`
- `btree_gist`

### Triggers
- `on_auth_user_created` on `auth.users` -> calls `public.handle_new_user()`
- `resources_updated_at` on `public.resources` -> calls `public.set_updated_at()`
- `bookings_updated_at` on `public.bookings` -> calls `public.set_updated_at()`

### Constraint: bookings_no_overlap
- EXCLUDE constraint on `public.bookings` using gist: `resource_id with =, tstzrange(start_time, end_time) with &&` WHERE status IN ('Approved', 'Checked Out')

---

## 2. Expected Functions (8 SECURITY DEFINER RPCs)

| Function | Returns | Purpose |
|----------|---------|---------|
| `audit_write(p_action, p_entity_type, p_entity_id, p_reason, p_metadata)` | void | Internal helper to write audit log entries |
| `create_booking(p_resource_id, p_start_time, p_end_time)` | uuid | Create a Pending booking with eligibility and limit checks |
| `decide_booking(p_booking_id, p_decision, p_reason)` | void | Approve or reject a Pending booking |
| `record_checkout(p_booking_id, p_condition, p_accessories, p_expected_return_at)` | void | Record checkout on an Approved booking |
| `record_return(p_booking_id, p_condition, p_missing_accessories, p_damage_notes)` | void | Record return on a Checked Out booking |
| `confirm_return(p_booking_id)` | void | Owner confirms return -> Completed |
| `report_incident(p_booking_id, p_type, p_description)` | uuid | Report an incident on a Checked Out/Returned booking |
| `resolve_incident(p_incident_id, p_status, p_resolution_notes)` | void | Review/resolve an incident |

---

## 3. Expected RLS Policies (from 001_initial.sql)

| Table | Policy | Operation | Condition |
|-------|--------|-----------|-----------|
| profiles | profiles_select_all | SELECT | true (all authenticated) |
| profiles | profiles_update_own | UPDATE | auth.uid() = id |
| resource_categories | categories_select_all | SELECT | true |
| resources | resources_select_active | SELECT | status = 'active' |
| resources | resources_select_owner_manager | SELECT | owner OR manager/admin |
| resources | resources_insert_owner | INSERT | owner_id = auth.uid() |
| resources | resources_update_owner | UPDATE | owner_id = auth.uid() |
| resources | resources_delete_owner | DELETE | owner_id = auth.uid() |
| bookings | bookings_select_own_or_resource_or_manager | SELECT | borrower OR owner-resource OR manager/admin |
| bookings | bookings_insert_none | INSERT | false (blocked) |
| bookings | bookings_update_none | UPDATE | false (blocked) |
| bookings | bookings_delete_none | DELETE | false (blocked) |
| incidents | incidents_select_reporter_or_owner_or_manager | SELECT | reporter OR owner-resource OR manager/admin |
| incidents | incidents_insert_reporter | INSERT | reported_by = auth.uid() |
| incidents | incidents_update_owner_manager | UPDATE | owner-resource OR manager/admin |
| notifications | notifications_select_own | SELECT | user_id = auth.uid() |
| notifications | notifications_update_own_read | UPDATE | user_id = auth.uid() AND read is not null |
| audit_logs | audit_logs_select_all | SELECT | true (all authenticated) |
| audit_logs | audit_logs_insert_authenticated | INSERT | true (all authenticated) |

---

## 4. Changes Introduced by Migration 003

### Change 1: Audit Logs — Block direct INSERT
- **Drop:** `audit_logs_insert_authenticated` (allowed all authenticated users to INSERT)
- **Create:** `audit_logs_insert_none` with `WITH CHECK (false)` (blocks all direct INSERTs)
- **Effect:** Only `audit_write` SECURITY DEFINER RPC can write audit entries. Direct INSERT by any authenticated user is blocked.

### Change 2: Audit Logs — Restrict SELECT
- **Drop:** `audit_logs_select_all` (allowed all authenticated users to read)
- **Create:** `audit_logs_select_manager_admin` (only manager/admin can read)

### Change 3: Profiles — Restrict SELECT
- **Drop:** `profiles_select_all` (allowed all authenticated users to read all profiles)
- **Create:** `profiles_select_own_or_manager_admin` (users read own profile; managers/admins read all)

### Change 4: Notifications — Block direct UPDATE
- **Drop:** `notifications_update_own_read` (allowed users to update `read` and potentially other columns)
- **Create:** `notifications_update_none` with `USING (false)` (blocks all direct UPDATEs)

### Change 5: Notifications — Add mark_notification_read RPC
- **Create:** `public.mark_notification_read(p_notification_id uuid)` SECURITY DEFINER RPC
- **Effect:** Sets `read = true` only where `user_id = auth.uid()`. Frontend must call this RPC instead of direct UPDATE.

### Change 6: Booking Concurrency — `create_booking` row lock
- **Modify:** `create_booking` function — added `FOR UPDATE` to the borrower profile SELECT
- **Effect:** Serializes concurrent booking requests for the same user, preventing active-booking-limit race conditions

### Change 7: Incident Reporting — `report_incident` authorization
- **Modify:** `report_incident` function — added check that reporter is borrower, resource owner, or manager/admin
- **Effect:** Unauthorized users cannot report incidents on bookings they are not involved with

---

## 5. Read-Only SQL Queries for Supabase SQL Editor

Run these queries one at a time in the Supabase SQL Editor. Copy and save the results.

### Query 5a: List all seven application tables
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'resource_categories', 'resources', 'bookings', 'incidents', 'notifications', 'audit_logs')
ORDER BY table_name;
```

### Query 5b: Column definitions for all seven tables
```sql
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'resource_categories', 'resources', 'bookings', 'incidents', 'notifications', 'audit_logs')
ORDER BY table_name, ordinal_position;
```

### Query 5c: Table constraints (check, unique, primary key, foreign key)
```sql
SELECT 
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  pg_get_constraintdef(c.oid) AS constraint_definition
FROM information_schema.table_constraints tc
JOIN pg_constraint c ON c.conname = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name IN ('profiles', 'resource_categories', 'resources', 'bookings', 'incidents', 'notifications', 'audit_logs')
ORDER BY tc.table_name, tc.constraint_name;
```

### Query 5d: Indexes on all seven tables
```sql
SELECT 
  t.table_name,
  i.indexname,
  i.indexdef
FROM pg_indexes i
JOIN information_schema.tables t ON t.table_name = i.tablename
WHERE i.schemaname = 'public'
  AND t.table_name IN ('profiles', 'resource_categories', 'resources', 'bookings', 'incidents', 'notifications', 'audit_logs')
ORDER BY t.table_name, i.indexname;
```

### Query 5e: RLS policies on all seven tables
```sql
SELECT 
  polname AS policy_name,
  polrelid::regclass AS table_name,
  CASE polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    ELSE polcmd::text
  END AS operation,
  pg_get_expr(polqual, polrelid) AS using_condition,
  pg_get_expr(polwithcheck, polrelid) AS with_check_condition
FROM pg_policy
JOIN pg_class ON pg_class.oid = polrelid
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE pg_namespace.nspname = 'public'
ORDER BY table_name, policy_name;
```

### Query 5e-alt: Check if RLS is enabled on each table
```sql
SELECT 
  relname AS table_name,
  relrowsecurity AS rls_enabled,
  relforcerowsecurity AS rls_forced
FROM pg_class
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE pg_namespace.nspname = 'public'
  AND relname IN ('profiles', 'resource_categories', 'resources', 'bookings', 'incidents', 'notifications', 'audit_logs')
  AND relkind = 'r'
ORDER BY relname;
```

### Query 5f: Function definitions (all 8 application functions + helper)
```sql
SELECT 
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type,
  p.prosecdef AS security_definer,
  pg_get_functiondef(p.oid) AS full_definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'audit_write',
    'create_booking',
    'decide_booking',
    'record_checkout',
    'record_return',
    'confirm_return',
    'report_incident',
    'resolve_incident',
    'mark_notification_read',
    'handle_new_user',
    'set_updated_at'
  )
ORDER BY function_name;
```

### Query 5g: Row counts for all seven tables
```sql
SELECT 'profiles' AS table_name, count(*) AS row_count FROM public.profiles
UNION ALL
SELECT 'resource_categories', count(*) FROM public.resource_categories
UNION ALL
SELECT 'resources', count(*) FROM public.resources
UNION ALL
SELECT 'bookings', count(*) FROM public.bookings
UNION ALL
SELECT 'incidents', count(*) FROM public.incidents
UNION ALL
SELECT 'notifications', count(*) FROM public.notifications
UNION ALL
SELECT 'audit_logs', count(*) FROM public.audit_logs
ORDER BY table_name;
```

### Query 5h: Check which policies exist before applying 003 (optional verification)
```sql
SELECT polname AS policy_name, polrelid::regclass AS table_name
FROM pg_policy
WHERE polrelid::regclass::text IN ('public.profiles', 'public.audit_logs', 'public.notifications')
ORDER BY table_name, policy_name;
```

---

## 6. Important Limitations

1. **Not a complete backup:** These queries capture table structure, constraints, indexes, policies, and function definitions. They do NOT capture actual data rows (except row counts).
2. **Schema may differ:** Your database may not exactly match `001_initial.sql` if migration 001 partially failed or if manual changes were made. The query results are your source of truth.
3. **No auth.users export:** The queries do not include `auth.users` (Supabase Auth). You cannot export auth users via SQL Editor without superuser access.
4. **If something goes wrong:** To revert migration 003, you would need to recreate the dropped policies (`audit_logs_insert_authenticated`, `audit_logs_select_all`, `profiles_select_all`, `notifications_update_own_read`) and restore the original function bodies for `create_booking` and `report_incident`. The query results above serve as your reference for what to restore.

---

## 7. Next Steps

1. Run queries 5a through 5g in the Supabase SQL Editor.
2. Save all results (copy/paste into a text file or document).
3. Review that the actual schema matches the expected schema above.
4. Share the results here before I recommend whether to proceed with migration 003.

**Do not run migration 003 until you have captured and reviewed the query results.**
