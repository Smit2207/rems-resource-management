-- 004_upgrade_existing.sql
-- Forward-only security hardening migration for an EXISTING Supabase database.
--
-- Prerequisites (verify before running):
--   - Tables: profiles, resource_categories, resources, bookings, incidents,
--             notifications, audit_logs must exist
--   - Functions: audit_write, create_booking, decide_booking, record_checkout,
--                record_return, confirm_return, report_incident, resolve_incident,
--                cancel_booking must exist
--   - Constraint: bookings_no_overlap (EXCLUDE, contype='x') must exist
--   - RLS must be enabled on all 7 tables
--
-- This migration is idempotent-safe: uses DROP POLICY IF EXISTS /
-- CREATE OR REPLACE FUNCTION / REVOKE/GRANT patterns.
-- It does NOT drop tables, functions, or constraints.
-- It does NOT recreate cancel_booking (already exists in live DB).
-- It does NOT touch bookings_no_overlap.
--
-- Run in the Supabase SQL Editor as a single script.

-- ============================================================
-- 0. HELPER: is_manager_or_admin (add if missing)
--    Non-recursive role check used by RLS policies.
-- ============================================================
create or replace function public.is_manager_or_admin()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role
  from public.profiles
  where id = auth.uid();

  if not found then
    return false;
  end if;

  return v_role in ('manager', 'admin');
end;
$$;

-- ============================================================
-- 1. AUDIT LOGS: fix RLS policies
--    Block direct INSERT; restrict SELECT to manager/admin.
--    These policies may already exist from migration 001, so drop
--    them first to keep this migration idempotent and rerun-safe.
-- ============================================================
drop policy if exists audit_logs_insert_authenticated on public.audit_logs;
drop policy if exists audit_logs_insert_none on public.audit_logs;
create policy audit_logs_insert_none
  on public.audit_logs for insert
  to authenticated
  with check (false);

drop policy if exists audit_logs_select_all on public.audit_logs;
drop policy if exists audit_logs_select_manager_admin on public.audit_logs;
create policy audit_logs_select_manager_admin
  on public.audit_logs for select
  to authenticated
  using (public.is_manager_or_admin());

-- Ensure no other insert/update/delete policies exist on audit_logs
drop policy if exists audit_logs_insert_none_rev on public.audit_logs;
-- (no-op; ensures clean state)

-- ============================================================
-- 2. PROFILES: fix RLS policies
--    Users read own profile; managers/admins read all.
--    Uses is_manager_or_admin() to avoid recursive RLS on profiles.
-- ============================================================
drop policy if exists profiles_select_all on public.profiles;
drop policy if exists profiles_select_own_or_manager_admin on public.profiles;
create policy profiles_select_own_or_manager_admin
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or public.is_manager_or_admin()
  );

drop policy if exists profiles_insert_none on public.profiles;
create policy profiles_insert_none
  on public.profiles for insert
  to authenticated
  with check (false);

drop policy if exists profiles_delete_none on public.profiles;
create policy profiles_delete_none
  on public.profiles for delete
  to authenticated
  using (false);

-- ============================================================
-- 3. NOTIFICATIONS: fix RLS policies and add mark_notification_read RPC
--    Block direct UPDATE; add RPC as secure replacement.
-- ============================================================
drop policy if exists notifications_update_own_read on public.notifications;
drop policy if exists notifications_update_none on public.notifications;
create policy notifications_update_none
  on public.notifications for update
  to authenticated
  using (false);

drop policy if exists notifications_insert_none on public.notifications;
create policy notifications_insert_none
  on public.notifications for insert
  to authenticated
  with check (false);

drop policy if exists notifications_delete_none on public.notifications;
create policy notifications_delete_none
  on public.notifications for delete
  to authenticated
  using (false);

create or replace function public.mark_notification_read(
  p_notification_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.notifications
  set read = true
  where id = p_notification_id
    and user_id = auth.uid();
end;
$$;

-- ============================================================
-- 4. FIX create_booking: add FOR UPDATE on borrower profile,
--    NULL-safe training validation
-- ============================================================
create or replace function public.create_booking(
  p_resource_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borrower uuid := auth.uid();
  v_resource public.resources%rowtype;
  v_owner uuid;
  v_active_count integer;
  v_profile public.profiles%rowtype;
  v_booking_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_resource
  from public.resources
  where id = p_resource_id
  for update;

  if not found then
    raise exception 'Resource not found';
  end if;

  if v_resource.status <> 'active' then
    raise exception 'Resource is not available for booking';
  end if;

  if p_end_time <= p_start_time then
    raise exception 'End time must be after start time';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_borrower
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  if v_resource.eligibility_department is not null
     and v_profile.department is distinct from v_resource.eligibility_department then
    raise exception 'You are not eligible to book this resource (department mismatch)';
  end if;

  if v_resource.eligibility_min_year is not null
     and (v_profile.year_of_study is null or v_profile.year_of_study < v_resource.eligibility_min_year) then
    raise exception 'You are not eligible to book this resource (year requirement not met)';
  end if;

  -- NULL-safe training validation
  if v_resource.required_training
     and v_resource.training_required is not null
     and not (v_resource.training_required = any(coalesce(v_profile.training_completed, '{}'::text[]))) then
    raise exception 'You have not completed the required training for this resource';
  end if;

  select count(*) into v_active_count
  from public.bookings
  where borrower_id = v_borrower
    and status in ('Pending', 'Approved', 'Checked Out');

  if v_active_count >= 2 then
    raise exception 'You already have the maximum of 2 active bookings';
  end if;

  insert into public.bookings (resource_id, borrower_id, start_time, end_time, status)
  values (p_resource_id, v_borrower, p_start_time, p_end_time, 'Pending')
  returning id into v_booking_id;

  select owner_id into v_owner from public.resources where id = p_resource_id;

  insert into public.notifications (user_id, type, title, message, related_resource_id, related_booking_id)
  values (
    v_owner,
    'booking_requested',
    'New booking request',
    format('%s requested to book "%s" from %s to %s',
      v_profile.full_name or v_profile.email,
      v_resource.name,
      to_char(p_start_time at time zone 'UTC', 'YYYY-MM-DD HH24:MI'),
      to_char(p_end_time at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
    ),
    p_resource_id,
    v_booking_id
  );

  perform public.audit_write(
    'create_booking',
    'booking',
    v_booking_id,
    format('Pending booking for resource %s', p_resource_id),
    jsonb_build_object('resource_id', p_resource_id, 'start_time', p_start_time, 'end_time', p_end_time)
  );

  return v_booking_id;
end;
$$;

-- ============================================================
-- 5. FIX report_incident: add caller authorization check
-- ============================================================
create or replace function public.report_incident(
  p_booking_id uuid,
  p_type text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_resource public.resources%rowtype;
  v_actor uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_incident_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  select * into v_resource
  from public.resources r
  where r.id = v_booking.resource_id
  for update;

  if v_booking.borrower_id <> v_actor then
    if v_resource.owner_id <> v_actor then
      select * into v_profile from public.profiles where id = v_actor;
      if not found or v_profile.role not in ('manager', 'admin') then
        raise exception 'Only the borrower, resource owner, or a manager may report incidents';
      end if;
    end if;
  end if;

  if v_booking.status not in ('Checked Out', 'Returned') then
    raise exception 'Incidents can only be reported on checked-out or returned bookings';
  end if;

  insert into public.incidents (booking_id, reported_by, type, description, status)
  values (p_booking_id, v_actor, p_type, p_description, 'open')
  returning id into v_incident_id;

  insert into public.notifications (user_id, type, title, message, related_resource_id, related_booking_id)
  values (
    v_resource.owner_id,
    'incident_status_changed',
    'New incident reported',
    format('A "%s" incident was reported for "%s"', p_type, v_resource.name),
    v_resource.id,
    p_booking_id
  );

  perform public.audit_write(
    'report_incident', 'incident', v_incident_id, null,
    jsonb_build_object('booking_id', p_booking_id, 'type', p_type)
  );

  return v_incident_id;
end;
$$;

-- ============================================================
-- 6. FIX resolve_incident: separate SELECT INTO for incident row
--    (fixes invalid multi-table SELECT * INTO pattern)
-- ============================================================
create or replace function public.resolve_incident(
  p_incident_id uuid,
  p_status text,
  p_resolution_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_incident public.incidents%rowtype;
  v_resource_id uuid;
  v_owner_id uuid;
  v_actor uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Select incident row separately (v_incident is incidents%rowtype only)
  select * into v_incident
  from public.incidents
  where id = p_incident_id
  for update;

  if not found then
    raise exception 'Incident not found';
  end if;

  -- Lock booking row separately and get resource id
  select b.resource_id into v_resource_id
  from public.bookings b
  where b.id = v_incident.booking_id
  for update;

  -- Get resource owner
  select r.owner_id into v_owner_id
  from public.resources r
  where r.id = v_resource_id;

  -- Authorization: only resource owner or manager/admin
  if v_owner_id <> v_actor then
    select * into v_profile from public.profiles where id = v_actor;
    if not found or v_profile.role not in ('manager', 'admin') then
      raise exception 'Only the resource owner or a manager may review incidents';
    end if;
  end if;

  -- Only valid status transitions
  if p_status = 'under_review' and v_incident.status = 'open' then
    update public.incidents
    set status = 'under_review', reviewed_by = v_actor, reviewed_at = now(),
        resolution_notes = p_resolution_notes
    where id = p_incident_id;
  elsif p_status = 'resolved' and v_incident.status in ('open', 'under_review') then
    update public.incidents
    set status = 'resolved', reviewed_by = v_actor, reviewed_at = now(),
        resolution_notes = p_resolution_notes
    where id = p_incident_id;
  else
    raise exception 'Invalid incident status transition';
  end if;

  perform public.audit_write(
    'resolve_incident', 'incident', p_incident_id, p_resolution_notes,
    jsonb_build_object('status', p_status)
  );
end;
$$;

-- ============================================================
-- 7. Add auth.uid() checks to all other SECURITY DEFINER functions
--    (decide_booking, record_checkout, record_return, confirm_return,
--     cancel_booking) -- each already has logic, adding explicit auth check
-- ============================================================

-- decide_booking already has auth logic via v_actor := auth.uid();
-- Adding explicit null check:
create or replace function public.decide_booking(
  p_booking_id uuid,
  p_decision text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_resource public.resources%rowtype;
  v_actor uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  select * into v_resource
  from public.resources r
  where r.id = v_booking.resource_id
  for update;

  if v_booking.status <> 'Pending' then
    raise exception 'Only pending bookings can be approved or rejected';
  end if;

  if v_resource.owner_id <> v_actor then
    select * into v_profile from public.profiles where id = v_actor;
    if not found or v_profile.role not in ('manager', 'admin') then
      raise exception 'Only the resource owner or a manager may review this booking';
    end if;
  end if;

  if p_decision = 'reject' then
    if p_reason is null or trim(p_reason) = '' then
      raise exception 'A reason is required when rejecting a booking';
    end if;

    update public.bookings
    set status = 'Rejected', rejection_reason = p_reason,
        decided_at = now(), decided_by = v_actor,
        updated_at = now()
    where id = p_booking_id;

    insert into public.notifications (user_id, type, title, message, related_resource_id, related_booking_id)
    values (
      v_booking.borrower_id,
      'booking_rejected',
      'Booking request declined',
      format('Your request for "%s" was declined: %s', v_resource.name, p_reason),
      v_resource.id,
      p_booking_id
    );

    perform public.audit_write(
      'reject_booking', 'booking', p_booking_id, p_reason,
      jsonb_build_object('resource_id', v_resource.id, 'reason', p_reason)
    );
  elsif p_decision = 'approve' then
    update public.bookings
    set status = 'Approved', decided_at = now(), decided_by = v_actor,
        updated_at = now()
    where id = p_booking_id;

    insert into public.notifications (user_id, type, title, message, related_resource_id, related_booking_id)
    values (
      v_booking.borrower_id,
      'booking_approved',
      'Booking approved',
      format('Your request for "%s" has been approved', v_resource.name),
      v_resource.id,
      p_booking_id
    );

    perform public.audit_write(
      'approve_booking', 'booking', p_booking_id, null,
      jsonb_build_object('resource_id', v_resource.id)
    );
  else
    raise exception 'Decision must be approve or reject';
  end if;
end;
$$;

-- record_checkout already has auth logic; adding explicit check:
create or replace function public.record_checkout(
  p_booking_id uuid,
  p_condition text,
  p_accessories text[],
  p_expected_return_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_resource public.resources%rowtype;
  v_actor uuid := auth.uid();
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  select * into v_resource
  from public.resources r
  where r.id = v_booking.resource_id
  for update;

  if v_booking.status <> 'Approved' then
    raise exception 'Only approved bookings can be checked out';
  end if;

  if v_resource.owner_id <> v_actor then
    select * into v_profile from public.profiles where id = v_actor;
    if not found or v_profile.role not in ('manager', 'admin') then
      raise exception 'Only the resource owner may record checkout';
    end if;
  end if;

  if p_expected_return_at <= now() then
    raise exception 'Expected return time must be in the future';
  end if;

  update public.bookings
  set status = 'Checked Out',
      checkout_at = now(),
      checkout_by = v_actor,
      checkout_condition = p_condition,
      accessories_included = p_accessories,
      expected_return_at = p_expected_return_at,
      updated_at = now()
  where id = p_booking_id;

  insert into public.notifications (user_id, type, title, message, related_resource_id, related_booking_id)
  values (
    v_booking.borrower_id,
    'checkout_recorded',
    'Checkout recorded',
    format('Checkout recorded for "%s". Expected return: %s',
      v_resource.name,
      to_char(p_expected_return_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI')
    ),
    v_resource.id,
    p_booking_id
  );

  perform public.audit_write(
    'record_checkout', 'booking', p_booking_id, null,
    jsonb_build_object('resource_id', v_resource.id, 'condition', p_condition, 'expected_return_at', p_expected_return_at)
  );
end;
$$;

-- record_return already has auth logic; adding explicit check:
create or replace function public.record_return(
  p_booking_id uuid,
  p_condition text,
  p_missing_accessories text[],
  p_damage_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_resource public.resources%rowtype;
  v_actor uuid := auth.uid();
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  select * into v_resource
  from public.resources r
  where r.id = v_booking.resource_id
  for update;

  if v_booking.status <> 'Checked Out' then
    raise exception 'Only checked-out bookings can be returned';
  end if;

  if v_booking.borrower_id <> v_actor then
    raise exception 'Only the borrower may record a return';
  end if;

  update public.bookings
  set status = 'Returned',
      return_at = now(),
      return_by = v_actor,
      return_condition = p_condition,
      missing_accessories = p_missing_accessories,
      damage_notes = p_damage_notes,
      updated_at = now()
  where id = p_booking_id;

  insert into public.notifications (user_id, type, title, message, related_resource_id, related_booking_id)
  values (
    v_resource.owner_id,
    'return_recorded',
    'Return recorded',
    format('The borrower returned "%s". Condition: %s', v_resource.name, p_condition),
    v_resource.id,
    p_booking_id
  );

  perform public.audit_write(
    'record_return', 'booking', p_booking_id, null,
    jsonb_build_object('resource_id', v_resource.id, 'condition', p_condition, 'missing_accessories', p_missing_accessories)
  );
end;
$$;

-- confirm_return already has auth logic; adding explicit check:
create or replace function public.confirm_return(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_resource public.resources%rowtype;
  v_actor uuid := auth.uid();
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_booking
  from public.bookings b
  where b.id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  select * into v_resource
  from public.resources r
  where r.id = v_booking.resource_id
  for update;

  if v_booking.status <> 'Returned' then
    raise exception 'Only returned bookings can be confirmed';
  end if;

  if v_resource.owner_id <> v_actor then
    raise exception 'Only the resource owner may confirm a return';
  end if;

  update public.bookings
  set status = 'Completed', updated_at = now()
  where id = p_booking_id;

  perform public.audit_write(
    'confirm_return', 'booking', p_booking_id, null,
    jsonb_build_object('resource_id', v_resource.id)
  );
end;
$$;

-- cancel_booking already exists in live DB; adding explicit auth check:
create or replace function public.cancel_booking(
  p_booking_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
  v_actor uuid := auth.uid();
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if v_booking.status <> 'Pending' then
    raise exception 'Only pending bookings can be cancelled';
  end if;

  if v_booking.borrower_id <> v_actor then
    raise exception 'Only the borrower may cancel their own booking';
  end if;

  update public.bookings
  set status = 'Cancelled', updated_at = now()
  where id = p_booking_id;

  perform public.audit_write(
    'cancel_booking', 'booking', p_booking_id, null,
    jsonb_build_object('resource_id', v_booking.resource_id)
  );
end;
$$;

-- ============================================================
-- 8. FUNCTION EXECUTION PERMISSIONS
--    Revoke from PUBLIC and anon; Grant to authenticated only.
--    audit_write is NOT granted to any application role.
-- ============================================================

-- Revoke from PUBLIC (covers anon and all roles)
revoke execute on function public.audit_write(text, text, uuid, text, jsonb) from public;
revoke execute on function public.cancel_booking(uuid) from public;
revoke execute on function public.create_booking(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.decide_booking(uuid, text, text) from public;
revoke execute on function public.is_manager_or_admin() from public;
revoke execute on function public.mark_notification_read(uuid) from public;
revoke execute on function public.record_checkout(uuid, text, text[], timestamptz) from public;
revoke execute on function public.record_return(uuid, text, text[], text) from public;
revoke execute on function public.report_incident(uuid, text, text) from public;
revoke execute on function public.resolve_incident(uuid, text, text) from public;

-- Also revoke explicitly from anon (defense in depth)
revoke execute on function public.audit_write(text, text, uuid, text, jsonb) from anon;
revoke execute on function public.cancel_booking(uuid) from anon;
revoke execute on function public.create_booking(uuid, timestamptz, timestamptz) from anon;
revoke execute on function public.decide_booking(uuid, text, text) from anon;
revoke execute on function public.is_manager_or_admin() from anon;
revoke execute on function public.mark_notification_read(uuid) from anon;
revoke execute on function public.record_checkout(uuid, text, text[], timestamptz) from anon;
revoke execute on function public.record_return(uuid, text, text[], text) from anon;
revoke execute on function public.report_incident(uuid, text, text) from anon;
revoke execute on function public.resolve_incident(uuid, text, text) from anon;

-- Grant to authenticated for frontend RPCs only (NOT audit_write)
grant execute on function public.cancel_booking(uuid) to authenticated;
grant execute on function public.create_booking(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.decide_booking(uuid, text, text) to authenticated;
grant execute on function public.is_manager_or_admin() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.record_checkout(uuid, text, text[], timestamptz) to authenticated;
grant execute on function public.record_return(uuid, text, text[], text) to authenticated;
grant execute on function public.report_incident(uuid, text, text) to authenticated;
grant execute on function public.resolve_incident(uuid, text, text) to authenticated;

-- ============================================================
-- 9. TABLE-LEVEL PRIVILEGE HARDENING
--    Revoke ALL from PUBLIC and anon; grant SELECT only to authenticated
--    (RLS provides row-level filtering).
-- ============================================================

revoke all on table public.profiles from public;
revoke all on table public.resource_categories from public;
revoke all on table public.resources from public;
revoke all on table public.bookings from public;
revoke all on table public.incidents from public;
revoke all on table public.notifications from public;
revoke all on table public.audit_logs from public;

revoke all on table public.profiles from anon;
revoke all on table public.resource_categories from anon;
revoke all on table public.resources from anon;
revoke all on table public.bookings from anon;
revoke all on table public.incidents from anon;
revoke all on table public.notifications from anon;
revoke all on table public.audit_logs from anon;

grant select on table public.profiles to authenticated;
grant select on table public.resource_categories to authenticated;
grant select on table public.resources to authenticated;
grant select on table public.bookings to authenticated;
grant select on table public.incidents to authenticated;
grant select on table public.notifications to authenticated;
grant select on table public.audit_logs to authenticated;

-- ============================================================
-- End of 004_upgrade_existing.sql
-- ============================================================
