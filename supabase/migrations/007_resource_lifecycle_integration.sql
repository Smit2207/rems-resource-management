-- 007_resource_lifecycle_integration.sql
-- Phase 1.1: Lifecycle integration with booking RPCs + security fixes for migration 006
--
-- Safe to apply to an existing database that already has migrations 001-006.
-- Does NOT drop or modify any existing tables, columns, constraints, or RPCs permanently.
-- Uses CREATE OR REPLACE FUNCTION to safely update existing RPCs.
-- Preserves the bookings_no_overlap exclusion constraint.
-- Preserves all existing RLS policies and function permissions.
--
-- Changes:
--   1. Fix check_borrower_eligibility: add caller authorization check
--   2. Add auth.uid() null checks to migration 006's new RPCs
--   3. Add server-side lifecycle transition trigger (prevents invalid transitions)
--   4. Add lifecycle/status sync trigger (keeps lifecycle_state consistent with status)
--   5. Integrate lifecycle updates into existing booking RPCs:
--      create_booking, decide_booking, record_checkout, record_return,
--      confirm_return, cancel_booking, report_incident, resolve_incident
--   6. Add lifecycle_state check to create_booking (block non-bookable resources)
--
-- Lifecycle ↔ Booking Event Mapping:
--   create_booking (Pending)   → no lifecycle change (Pending doesn't block)
--   decide_booking (approve)   → lifecycle = 'reserved' (if future booking)
--   decide_booking (reject)    → recompute lifecycle
--   record_checkout            → lifecycle = 'checked_out'
--   record_return              → lifecycle = 'return_review'
--   confirm_return             → lifecycle = 'available'
--   cancel_booking (Pending)   → recompute lifecycle
--   report_incident            → lifecycle = 'investigation'
--   resolve_incident (resolved)→ lifecycle = 'available'
--   resolve_incident (under_review) → lifecycle = 'investigation'

-- ============================================================
-- 0. Helper: compute effective lifecycle state from bookings
--    Used by triggers to recompute lifecycle after booking changes.
-- ============================================================
create or replace function public.compute_effective_lifecycle_state(
  p_resource_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stored_state text;
  v_has_checked_out boolean;
  v_has_approved_or_checked_out boolean;
begin
  select lifecycle_state into v_stored_state
  from public.resources
  where id = p_resource_id;

  if not found then
    return null;
  end if;

  -- Non-bookable states take precedence regardless of bookings
  if v_stored_state in (
    'draft', 'pending_verification', 'maintenance',
    'investigation', 'retired'
  ) then
    return v_stored_state;
  end if;

  select count(*) > 0 into v_has_checked_out
  from public.bookings
  where resource_id = p_resource_id
    and status = 'Checked Out';

  select count(*) > 0 into v_has_approved_or_checked_out
  from public.bookings
  where resource_id = p_resource_id
    and status in ('Approved', 'Checked Out');

  if v_has_checked_out then
    return 'checked_out';
  end if;

  if v_has_approved_or_checked_out then
    return 'reserved';
  end if;

  return coalesce(v_stored_state, 'available');
end;
$$;

grant execute on function public.compute_effective_lifecycle_state(uuid) to authenticated;
revoke execute on function public.compute_effective_lifecycle_state(uuid) from public;
revoke execute on function public.compute_effective_lifecycle_state(uuid) from anon;

-- ============================================================
-- 1. Fix check_borrower_eligibility: add caller authorization
--    Only the borrower themselves or a manager/admin may check
--    another user's eligibility. Prevents boolean-oracle profiling.
-- ============================================================
create or replace function public.check_borrower_eligibility(
  p_resource_id uuid,
  p_borrower_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource public.resources%rowtype;
  v_profile public.profiles%rowtype;
  v_actor uuid := auth.uid();
  v_actor_role text;
begin
  -- Explicit authentication precondition
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  set local public.lifecycle_trusted_workflow = 'true';

  -- Authorization: caller may only check their own eligibility,
  -- or any eligibility if they are manager/admin.
  select role into v_actor_role
  from public.profiles
  where id = v_actor;

  if not found then
    raise exception 'Profile not found';
  end if;

  if p_borrower_id <> v_actor and v_actor_role not in ('manager', 'admin') then
    raise exception 'You may only check your own eligibility';
  end if;

  select * into v_resource
  from public.resources
  where id = p_resource_id;

  if not found then
    raise exception 'Resource not found';
  end if;

  select * into v_profile
  from public.profiles
  where id = p_borrower_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  -- Eligibility: department match (when set)
  if v_resource.eligibility_department is not null
     and v_profile.department is distinct from v_resource.eligibility_department then
    return false;
  end if;

  -- Eligibility: min year (when set)
  if v_resource.eligibility_min_year is not null
     and (v_profile.year_of_study is null or v_profile.year_of_study < v_resource.eligibility_min_year) then
    return false;
  end if;

  -- Training requirement (NULL-safe)
  if v_resource.required_training
     and v_resource.training_required is not null
     and not (v_resource.training_required = any(coalesce(v_profile.training_completed, '{}'::text[]))) then
    return false;
  end if;

  return true;
end;
$$;

grant execute on function public.check_borrower_eligibility(uuid, uuid) to authenticated;
revoke execute on function public.check_borrower_eligibility(uuid, uuid) from public;
revoke execute on function public.check_borrower_eligibility(uuid, uuid) from anon;

-- ============================================================
-- 2. Add auth.uid() null checks to migration 006's RPCs
--    (get_resource_lifecycle_state, check_resource_availability)
-- ============================================================
create or replace function public.get_resource_lifecycle_state(
  p_resource_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource_lifecycle text;
  v_has_checked_out boolean;
  v_has_approved_or_checked_out boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  set local public.lifecycle_trusted_workflow = 'true';

  select lifecycle_state into v_resource_lifecycle
  from public.resources
  where id = p_resource_id;

  if not found then
    raise exception 'Resource not found';
  end if;

  if v_resource_lifecycle in (
    'draft', 'pending_verification', 'maintenance',
    'investigation', 'retired'
  ) then
    return v_resource_lifecycle;
  end if;

  select count(*) > 0 into v_has_checked_out
  from public.bookings
  where resource_id = p_resource_id
    and status = 'Checked Out';

  select count(*) > 0 into v_has_approved_or_checked_out
  from public.bookings
  where resource_id = p_resource_id
    and status in ('Approved', 'Checked Out');

  if v_has_checked_out then
    return 'checked_out';
  end if;

  if v_has_approved_or_checked_out then
    return 'reserved';
  end if;

  return coalesce(v_resource_lifecycle, 'available');
end;
$$;

grant execute on function public.get_resource_lifecycle_state(uuid) to authenticated;
revoke execute on function public.get_resource_lifecycle_state(uuid) from public;
revoke execute on function public.get_resource_lifecycle_state(uuid) from anon;

create or replace function public.check_resource_availability(
  p_resource_id uuid,
  p_start_time timestamptz,
  p_end_time timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resource_state text;
  v_conflict_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  set local public.lifecycle_trusted_workflow = 'true';

  select public.get_resource_lifecycle_state(p_resource_id) into v_resource_state;

  if v_resource_state not in ('available', 'reserved') then
    return false;
  end if;

  select count(*) into v_conflict_count
  from public.bookings
  where resource_id = p_resource_id
    and status in ('Approved', 'Checked Out')
    and tstzrange(start_time, end_time) && tstzrange(p_start_time, p_end_time);

  return v_conflict_count = 0;
end;
$$;

grant execute on function public.check_resource_availability(uuid, timestamptz, timestamptz) to authenticated;
revoke execute on function public.check_resource_availability(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.check_resource_availability(uuid, timestamptz, timestamptz) from anon;

-- ============================================================
-- 3. Server-side lifecycle transition guard trigger
--    Prevents invalid lifecycle transitions at the database level.
--    Only managers/admins may transition lifecycle state.
-- ============================================================
create or replace function public.validate_resource_lifecycle_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_allowed_transitions text[];
  v_trusted boolean;
begin
  select current_setting('public.lifecycle_trusted_workflow', true) = 'true'
  into v_trusted;

  if new.lifecycle_state not in (
    'draft', 'pending_verification', 'available', 'reserved',
    'checked_out', 'return_review', 'maintenance', 'investigation', 'retired'
  ) then
    raise exception 'Invalid lifecycle state: %', new.lifecycle_state;
  end if;

  if new.lifecycle_state = old.lifecycle_state then
    return new;
  end if;

  if not v_trusted then
    select role into v_actor_role
    from public.profiles
    where id = v_actor;

    if not found or v_actor_role not in ('manager', 'admin') then
      raise exception 'Only managers and administrators may change resource lifecycle state';
    end if;
  end if;

  case old.lifecycle_state
    when 'draft' then
      v_allowed_transitions := array['pending_verification', 'retired'];
    when 'pending_verification' then
      v_allowed_transitions := array['available', 'retired'];
    when 'available' then
      v_allowed_transitions := array['reserved', 'maintenance', 'investigation', 'retired'];
    when 'reserved' then
      v_allowed_transitions := array['available', 'checked_out', 'maintenance', 'investigation', 'retired'];
    when 'checked_out' then
      v_allowed_transitions := array['return_review', 'maintenance', 'investigation', 'retired'];
    when 'return_review' then
      v_allowed_transitions := array['available', 'maintenance', 'investigation', 'retired'];
    when 'maintenance' then
      v_allowed_transitions := array['available', 'investigation', 'retired'];
    when 'investigation' then
      v_allowed_transitions := array['available', 'maintenance', 'retired'];
    when 'retired' then
      v_allowed_transitions := array[]::text[];
    else
      raise exception 'Unknown current lifecycle state: %', old.lifecycle_state;
  end case;

  if not (new.lifecycle_state = any(v_allowed_transitions)) then
    raise exception
      'Invalid lifecycle transition from % to %',
      old.lifecycle_state, new.lifecycle_state;
  end if;

  return new;
end;
$$;

-- Revoke direct execute on trigger function (it's only invoked by triggers)
revoke execute on function public.validate_resource_lifecycle_transition() from public;
revoke execute on function public.validate_resource_lifecycle_transition() from anon;

do $$
begin
  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'resources'
      and t.tgname = 'validate_resource_lifecycle_transition'
      and not t.tgisinternal
  ) then
    create trigger validate_resource_lifecycle_transition
      before update of lifecycle_state on public.resources
      for each row
      execute procedure public.validate_resource_lifecycle_transition();
  end if;
end $$;

-- ============================================================
-- 4. Lifecycle ↔ status sync trigger
--    Keeps lifecycle_state consistent with resources.status.
--    status = 'active'       → lifecycle_state = 'available'
--    status = 'maintenance'  → lifecycle_state = 'maintenance'
--    status = 'disabled'     → lifecycle_state = 'retired'
-- ============================================================
create or replace function public.sync_resource_lifecycle_from_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_desired text;
  v_allowed text[];
begin
  if new.status is distinct from old.status then
    case new.status
      when 'active' then v_desired := 'available';
      when 'maintenance' then v_desired := 'maintenance';
      when 'disabled' then v_desired := 'retired';
      else
        return new;
    end case;

    if v_desired is distinct from new.lifecycle_state then
      case old.lifecycle_state
        when 'draft' then v_allowed := array['pending_verification', 'retired'];
        when 'pending_verification' then v_allowed := array['available', 'retired'];
        when 'available' then v_allowed := array['reserved', 'maintenance', 'investigation', 'retired'];
        when 'reserved' then v_allowed := array['available', 'checked_out', 'maintenance', 'investigation', 'retired'];
        when 'checked_out' then v_allowed := array['return_review', 'maintenance', 'investigation', 'retired'];
        when 'return_review' then v_allowed := array['available', 'maintenance', 'investigation', 'retired'];
        when 'maintenance' then v_allowed := array['available', 'investigation', 'retired'];
        when 'investigation' then v_allowed := array['available', 'maintenance', 'retired'];
        when 'retired' then v_allowed := array[]::text[];
        else raise exception 'Unknown current lifecycle state: %', old.lifecycle_state;
      end case;

      if not (v_desired = any(v_allowed)) then
        raise exception
          'Invalid lifecycle transition from % to % implied by status change to %',
          old.lifecycle_state, v_desired, new.status;
      end if;

      new.lifecycle_state := v_desired;
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.sync_resource_lifecycle_from_status() from public;
revoke execute on function public.sync_resource_lifecycle_from_status() from anon;

do $$
begin
  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'resources'
      and t.tgname = 'sync_resource_lifecycle_from_status'
      and not t.tgisinternal
  ) then
    create trigger sync_resource_lifecycle_from_status
      before update of status on public.resources
      for each row
      execute procedure public.sync_resource_lifecycle_from_status();
  end if;
end $$;

-- ============================================================
-- 5. Integrate lifecycle updates into existing booking RPCs
--    Each RPC updates resource lifecycle_state after the booking
--    state change, using compute_effective_lifecycle_state().
-- ============================================================

-- 5a. create_booking: block non-bookable resources via lifecycle_state
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
  v_lifecycle_state text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  set local public.lifecycle_trusted_workflow = 'true';

  select * into v_resource
  from public.resources
  where id = p_resource_id
  for update;

  if not found then
    raise exception 'Resource not found';
  end if;

  -- Check lifecycle state blocks booking
  select public.get_resource_lifecycle_state(p_resource_id) into v_lifecycle_state;
  if v_lifecycle_state not in ('available', 'reserved') then
    raise exception 'Resource is not available for booking (lifecycle: %)', v_lifecycle_state;
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

grant execute on function public.create_booking(uuid, timestamptz, timestamptz) to authenticated;
revoke execute on function public.create_booking(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.create_booking(uuid, timestamptz, timestamptz) from anon;

-- 5b. decide_booking: recompute lifecycle after approve/reject
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
  v_new_lifecycle text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  set local public.lifecycle_trusted_workflow = 'true';

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

    -- Recompute lifecycle after rejection
    select public.compute_effective_lifecycle_state(v_resource.id) into v_new_lifecycle;
    update public.resources
    set lifecycle_state = v_new_lifecycle
    where id = v_resource.id;

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

    -- Set lifecycle to reserved (future booking exists)
    update public.resources
    set lifecycle_state = 'reserved'
    where id = v_resource.id;
  else
    raise exception 'Decision must be approve or reject';
  end if;
end;
$$;

grant execute on function public.decide_booking(uuid, text, text) to authenticated;
revoke execute on function public.decide_booking(uuid, text, text) from public;
revoke execute on function public.decide_booking(uuid, text, text) from anon;

-- 5c. record_checkout: set lifecycle to checked_out
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

  set local public.lifecycle_trusted_workflow = 'true';

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

  -- Set lifecycle to checked_out
  update public.resources
  set lifecycle_state = 'checked_out'
  where id = v_resource.id;

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

grant execute on function public.record_checkout(uuid, text, text[], timestamptz) to authenticated;
revoke execute on function public.record_checkout(uuid, text, text[], timestamptz) from public;
revoke execute on function public.record_checkout(uuid, text, text[], timestamptz) from anon;

-- 5d. record_return: set lifecycle to return_review
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

  set local public.lifecycle_trusted_workflow = 'true';

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

  -- Set lifecycle to return_review
  update public.resources
  set lifecycle_state = 'return_review'
  where id = v_resource.id;

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

grant execute on function public.record_return(uuid, text, text[], text) to authenticated;
revoke execute on function public.record_return(uuid, text, text[], text) from public;
revoke execute on function public.record_return(uuid, text, text[], text) from anon;

-- 5e. confirm_return: set lifecycle to available
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

  set local public.lifecycle_trusted_workflow = 'true';

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

  -- Set lifecycle to available
  update public.resources
  set lifecycle_state = 'available'
  where id = v_resource.id;

  perform public.audit_write(
    'confirm_return', 'booking', p_booking_id, null,
    jsonb_build_object('resource_id', v_resource.id)
  );
end;
$$;

grant execute on function public.confirm_return(uuid) to authenticated;
revoke execute on function public.confirm_return(uuid) from public;
revoke execute on function public.confirm_return(uuid) from anon;

-- 5f. cancel_booking: recompute lifecycle after cancellation
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
  v_new_lifecycle text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  set local public.lifecycle_trusted_workflow = 'true';

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

  -- Recompute lifecycle based on remaining bookings
  select public.compute_effective_lifecycle_state(v_booking.resource_id) into v_new_lifecycle;
  update public.resources
  set lifecycle_state = v_new_lifecycle
  where id = v_booking.resource_id;

  perform public.audit_write(
    'cancel_booking', 'booking', p_booking_id, null,
    jsonb_build_object('resource_id', v_booking.resource_id)
  );
end;
$$;

grant execute on function public.cancel_booking(uuid) to authenticated;
revoke execute on function public.cancel_booking(uuid) from public;
revoke execute on function public.cancel_booking(uuid) from anon;

-- 5g. report_incident: set lifecycle to investigation
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

  set local public.lifecycle_trusted_workflow = 'true';

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

  -- Set lifecycle to investigation
  update public.resources
  set lifecycle_state = 'investigation'
  where id = v_resource.id;

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

grant execute on function public.report_incident(uuid, text, text) to authenticated;
revoke execute on function public.report_incident(uuid, text, text) from public;
revoke execute on function public.report_incident(uuid, text, text) from anon;

-- 5h. resolve_incident: set lifecycle based on resolution
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
  v_new_lifecycle text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  set local public.lifecycle_trusted_workflow = 'true';

  select * into v_incident
  from public.incidents
  where id = p_incident_id
  for update;

  if not found then
    raise exception 'Incident not found';
  end if;

  select b.resource_id into v_resource_id
  from public.bookings b
  where b.id = v_incident.booking_id
  for update;

  select r.owner_id into v_owner_id
  from public.resources r
  where r.id = v_resource_id;

  if v_owner_id <> v_actor then
    select * into v_profile from public.profiles where id = v_actor;
    if not found or v_profile.role not in ('manager', 'admin') then
      raise exception 'Only the resource owner or a manager may review incidents';
    end if;
  end if;

  if p_status = 'under_review' and v_incident.status = 'open' then
    update public.incidents
    set status = 'under_review', reviewed_by = v_actor, reviewed_at = now(),
        resolution_notes = p_resolution_notes
    where id = p_incident_id;

    -- Set lifecycle to investigation when incident is under review
    update public.resources
    set lifecycle_state = 'investigation'
    where id = v_resource_id;
  elsif p_status = 'resolved' and v_incident.status in ('open', 'under_review') then
    update public.incidents
    set status = 'resolved', reviewed_by = v_actor, reviewed_at = now(),
        resolution_notes = p_resolution_notes
    where id = p_incident_id;
  else
    raise exception 'Invalid incident status transition';
  end if;

  -- When resolved, lifecycle goes back to available (recompute via bookings)
  if p_status = 'resolved' then
    select public.compute_effective_lifecycle_state(v_resource_id) into v_new_lifecycle;
    update public.resources
    set lifecycle_state = v_new_lifecycle
    where id = v_resource_id;
  end if;

  perform public.audit_write(
    'resolve_incident', 'incident', p_incident_id, p_resolution_notes,
    jsonb_build_object('status', p_status)
  );
end;
$$;

grant execute on function public.resolve_incident(uuid, text, text) to authenticated;
revoke execute on function public.resolve_incident(uuid, text, text) from public;
revoke execute on function public.resolve_incident(uuid, text, text) from anon;

-- ============================================================
-- End of 007_resource_lifecycle_integration.sql
-- ============================================================
