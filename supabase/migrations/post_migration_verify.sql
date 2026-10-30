-- post_migration_verify.sql
-- Post-migration verification SQL for the Resource Sharing Platform.
--
-- Run this AFTER applying migration 004_upgrade_existing.sql.
-- All queries are read-only.
--
-- Expected results are documented for each check.
-- If any check returns an unexpected result, do not proceed with testing.
-- Report the discrepancy before continuing.

-- ============================================================
-- CHECK 1: All seven application tables exist
-- ============================================================
SELECT
  table_name,
  'EXISTS' AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'profiles', 'resource_categories', 'resources',
    'bookings', 'incidents', 'notifications', 'audit_logs'
  )
ORDER BY table_name;

-- Expected: 7 rows, one for each table

-- ============================================================
-- CHECK 2: RLS is enabled on every application table
-- ============================================================
SELECT
  relname AS table_name,
  relrowsecurity AS rls_enabled,
  relforcerowsecurity AS rls_forced
FROM pg_class
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE pg_namespace.nspname = 'public'
  AND relname IN (
    'profiles', 'resource_categories', 'resources',
    'bookings', 'incidents', 'notifications', 'audit_logs'
  )
  AND relkind = 'r'
ORDER BY relname;

-- Expected: relrowsecurity = true for all 7 tables

-- ============================================================
-- CHECK 3: bookings_no_overlap EXCLUDE constraint exists
-- ============================================================
SELECT
  conname,
  contype,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'bookings'
  AND conname = 'bookings_no_overlap';

-- Expected: One row with contype = 'x' (EXCLUDE constraint)

-- ============================================================
-- CHECK 4: No PUBLIC or anon has EXECUTE on any RPC
-- ============================================================
SELECT
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND grantee IN ('PUBLIC', 'anon')
  AND routine_name IN (
    'audit_write', 'cancel_booking', 'create_booking', 'decide_booking',
    'record_checkout', 'record_return', 'confirm_return', 'report_incident',
    'resolve_incident', 'mark_notification_read', 'is_manager_or_admin'
  )
ORDER BY routine_name, grantee;

-- Expected: Zero rows (no PUBLIC or anon execution rights)

-- ============================================================
-- CHECK 5: authenticated has EXECUTE on app RPCs (not audit_write)
-- ============================================================
SELECT
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND grantee = 'authenticated'
ORDER BY routine_name;

-- Expected: Rows for cancel_booking, create_booking, decide_booking,
--           record_checkout, record_return, confirm_return,
--           report_incident, resolve_incident, mark_notification_read,
--           is_manager_or_admin
-- Expected: NO row for audit_write

-- ============================================================
-- CHECK 6: audit_write has no EXECUTE grants to any role
-- ============================================================
SELECT
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE specific_schema = 'public'
  AND routine_name = 'audit_write'
ORDER BY grantee;

-- Expected: Zero rows

-- ============================================================
-- CHECK 7: Correct RLS policies on affected tables
-- ============================================================
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
ORDER BY table_name, polname;

-- Expected policies present:
--   profiles: profiles_select_own_or_manager_admin (SELECT),
--             profiles_update_own (UPDATE),
--             profiles_insert_none (INSERT),
--             profiles_delete_none (DELETE)
--   resource_categories: categories_select_all (SELECT),
--                        categories_insert_none (INSERT),
--                        categories_update_none (UPDATE),
--                        categories_delete_none (DELETE)
--   resources: resources_select_active (SELECT),
--              resources_select_owner_or_manager (SELECT),
--              resources_insert_owner (INSERT),
--              resources_update_owner (UPDATE),
--              resources_delete_owner (DELETE)
--   bookings: bookings_select_own_or_resource_or_manager (SELECT),
--             bookings_insert_none (INSERT),
--             bookings_update_none (UPDATE),
--             bookings_delete_none (DELETE)
--   incidents: incidents_select_reporter_or_owner_or_manager (SELECT),
--              incidents_insert_reporter (INSERT),
--              incidents_update_owner_manager (UPDATE),
--              incidents_delete_none (DELETE)
--   notifications: notifications_select_own (SELECT),
--                  notifications_insert_none (INSERT),
--                  notifications_update_none (UPDATE),
--                  notifications_delete_none (DELETE)
--   audit_logs: audit_logs_select_manager_admin (SELECT),
--               audit_logs_insert_none (INSERT),
--               audit_logs_update_none (UPDATE),
--               audit_logs_delete_none (DELETE)
-- Expected policies ABSENT:
--   profiles_select_all, audit_logs_insert_authenticated,
--   audit_logs_select_all, notifications_update_own_read

-- ============================================================
-- CHECK 8: All required functions exist with correct signatures
-- ============================================================
SELECT
  proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type,
  prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN (
    'audit_write', 'cancel_booking', 'create_booking', 'decide_booking',
    'record_checkout', 'record_return', 'confirm_return', 'report_incident',
    'resolve_incident', 'mark_notification_read', 'is_manager_or_admin',
    'handle_new_user', 'set_updated_at'
  )
ORDER BY proname;

-- Expected: All functions present, security_definer = true for RPCs

-- ============================================================
-- CHECK 9: resolve_incident uses correct SELECT pattern
-- ============================================================
SELECT
  pg_get_functiondef(p.oid) AS function_body
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'resolve_incident';

-- Expected: Function body contains "select * into v_incident" (single table)
--           Does NOT contain "select i.*, b.resource_id into v_incident, v_resource_id"

-- ============================================================
-- CHECK 10: create_booking has FOR UPDATE on borrower profile
-- ============================================================
SELECT
  pg_get_functiondef(p.oid) AS function_body
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'create_booking';

-- Expected: Function body contains "from public.profiles" followed by "for update"
--           Contains "coalesce(v_profile.training_completed, '{}'::text[])" for NULL-safe training check

-- ============================================================
-- CHECK 11: report_incident has caller authorization
-- ============================================================
SELECT
  pg_get_functiondef(p.oid) AS function_body
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'report_incident';

-- Expected: Function body contains borrower/owner/manager authorization check
--           "Only the borrower, resource owner, or a manager may report incidents"

-- ============================================================
-- CHECK 12: Seed data present (after running 002_seed.sql)
-- ============================================================
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

-- Expected: Row counts reflect seeded data (profiles depend on auth.users existing)

-- ============================================================
-- CHECK 13: Seed data specific records
-- ============================================================
SELECT id, email, role FROM public.profiles WHERE email IN ('alice@college.edu','bob@college.edu','carol@college.edu','dave@college.edu') ORDER BY email;

-- Expected: 4 rows with roles student, manager, manager, admin respectively
-- (may be empty if auth users haven't signed up yet)

SELECT name, type, status, owner_id FROM public.resources ORDER BY name;

-- Expected: 3 resources (Olympus Microscope, Projector, Seminar Hall), all active

SELECT id, status, start_time, end_time FROM public.bookings ORDER BY start_time;

-- Expected: 2 bookings (1 Approved overlap demo, 1 Checked Out overdue demo)

-- ============================================================
-- End of post_migration_verify.sql
-- ============================================================
