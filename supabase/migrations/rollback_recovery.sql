-- rollback_recovery.sql
-- Rollback and recovery SQL for the Resource Sharing Platform.
--
-- USE ONLY IF MIGRATION 004 CAUSES ISSUES.
--
-- This script restores the previous (pre-004) RLS policies and function
-- execution permissions. It does NOT restore function bodies — those
-- should be captured from pg_get_functiondef() before running 004.
--
-- All statements are idempotent-safe (DROP IF EXISTS / CREATE patterns).
-- Run in the Supabase SQL Editor.
--
-- WARNING: This re-grants broader access than 004 intended. Only use
-- for emergency rollback, then plan a forward corrective migration.

-- ============================================================
-- STEP 1: Restore previous RLS policies
-- ============================================================

-- Restore audit_logs INSERT (was: WITH CHECK true — INSECURE)
drop policy if exists audit_logs_insert_none on public.audit_logs;
create policy audit_logs_insert_authenticated
  on public.audit_logs for insert
  to authenticated
  with check (true);

-- Restore audit_logs SELECT (was: USING true — INSECURE)
drop policy if exists audit_logs_select_manager_admin on public.audit_logs;
create policy audit_logs_select_all
  on public.audit_logs for select
  to authenticated
  using (true);

-- Restore profiles SELECT (was: USING true — INSECURE)
drop policy if exists profiles_select_own_or_manager_admin on public.profiles;
create policy profiles_select_all
  on public.profiles for select
  to authenticated
  using (true);

-- Restore notifications UPDATE (was: allowed read + other field changes — INSECURE)
drop policy if exists notifications_update_none on public.notifications;
create policy notifications_update_own_read
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (read is not null));

-- ============================================================
-- STEP 2: Restore function execution permissions (PUBLIC/anon access)
-- ============================================================

-- Re-grant PUBLIC access (undoes REVOKE from PUBLIC)
grant execute on function public.audit_write(text, text, uuid, text, jsonb) to public;
grant execute on function public.cancel_booking(uuid) to public;
grant execute on function public.create_booking(uuid, timestamptz, timestamptz) to public;
grant execute on function public.decide_booking(uuid, text, text) to public;
grant execute on function public.is_manager_or_admin() to public;
grant execute on function public.mark_notification_read(uuid) to public;
grant execute on function public.record_checkout(uuid, text, text[], timestamptz) to public;
grant execute on function public.record_return(uuid, text, text[], text) to public;
grant execute on function public.report_incident(uuid, text, text) to public;
grant execute on function public.resolve_incident(uuid, text, text) to public;

-- Re-grant anon access (undoes REVOKE from anon)
grant execute on function public.audit_write(text, text, uuid, text, jsonb) to anon;
grant execute on function public.cancel_booking(uuid) to anon;
grant execute on function public.create_booking(uuid, timestamptz, timestamptz) to anon;
grant execute on function public.decide_booking(uuid, text, text) to anon;
grant execute on function public.is_manager_or_admin() to anon;
grant execute on function public.mark_notification_read(uuid) to anon;
grant execute on function public.record_checkout(uuid, text, text[], timestamptz) to anon;
grant execute on function public.record_return(uuid, text, text[], text) to anon;
grant execute on function public.report_incident(uuid, text, text) to anon;
grant execute on function public.resolve_incident(uuid, text, text) to anon;

-- Re-grant authenticated access (undoes selective GRANT)
grant execute on function public.audit_write(text, text, uuid, text, jsonb) to authenticated;

-- ============================================================
-- STEP 3: Restore table-level privileges (PUBLIC/anon access)
-- ============================================================

-- Re-grant ALL on tables to PUBLIC (undoes REVOKE ALL from PUBLIC)
grant all on table public.profiles to public;
grant all on table public.resource_categories to public;
grant all on table public.resources to public;
grant all on table public.bookings to public;
grant all on table public.incidents to public;
grant all on table public.notifications to public;
grant all on table public.audit_logs to public;

-- Re-grant ALL on tables to anon (undoes REVOKE ALL from anon)
grant all on table public.profiles to anon;
grant all on table public.resource_categories to anon;
grant all on table public.resources to anon;
grant all on table public.bookings to anon;
grant all on table public.incidents to anon;
grant all on table public.notifications to anon;
grant all on table public.audit_logs to anon;

-- ============================================================
-- STEP 4: Restore original function bodies (MANUAL STEP)
-- ============================================================
--
-- The rollback script CANNOT automatically restore function bodies
-- because they were overwritten by CREATE OR REPLACE in 004.
--
-- BEFORE running 004, capture original function bodies:
--
--   SELECT pg_get_functiondef(p.oid)
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND proname IN ('create_booking', 'report_incident', 'resolve_incident',
--                     'decide_booking', 'record_checkout', 'record_return',
--                     'confirm_return', 'cancel_booking', 'audit_write');
--
-- Save the output. If you need to rollback function bodies, recreate them
-- using CREATE OR REPLACE FUNCTION with the saved definitions.
--
-- ============================================================
-- STEP 5: Verify rollback
-- ============================================================

-- Confirm PUBLIC/anon have EXECUTE again
select routine_name, grantee, privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and grantee in ('PUBLIC', 'anon')
  and routine_name in (
    'audit_write', 'cancel_booking', 'create_booking', 'decide_booking',
    'record_checkout', 'record_return', 'confirm_return', 'report_incident',
    'resolve_incident', 'mark_notification_read', 'is_manager_or_admin'
  )
order by routine_name, grantee;

-- Confirm old policies are back
select polname, polrelid::regclass as table_name
from pg_policy
join pg_class on pg_class.oid = polrelid
join pg_namespace on pg_namespace.oid = pg_class.relnamespace
where pg_namespace.nspname = 'public'
  and polname in (
    'audit_logs_insert_authenticated', 'audit_logs_select_all',
    'profiles_select_all', 'notifications_update_own_read'
  )
order by table_name, polname;

-- ============================================================
-- End of rollback_recovery.sql
-- ============================================================
