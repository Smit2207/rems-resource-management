-- 006_resource_lifecycle_and_matchmaker.sql
-- Phase 1: Resource Lifecycle Intelligence and Smart Resource Matchmaker
--
-- Safe to apply to an existing database that already has migrations 001-005.
-- Does NOT drop or modify any existing tables, columns, constraints, or RPCs.
-- Preserves the bookings_no_overlap exclusion constraint.
-- Preserves all existing RLS policies and function permissions.
--
-- Changes:
--   1. Add lifecycle_state column to public.resources (detailed operational state)
--   2. Add tags column to public.resources (for matchmaking)
--   3. Backfill lifecycle_state from existing status values
--   4. Add indexes for lifecycle_state and tags lookups
--   5. Add helper RPCs: get_resource_lifecycle_state, check_resource_availability,
--      check_borrower_eligibility (all SECURITY DEFINER, least-privilege grants)
--
-- Lifecycle states:
--   draft              - Resource created but not yet verified
--   pending_verification - Awaiting manager verification
--   available          - Ready to be booked (maps to status = 'active')
--   reserved           - Has future Approved/Checked Out booking
--   checked_out        - Currently checked out
--   return_review      - Returned, awaiting owner confirmation
--   maintenance        - Under maintenance (maps to status = 'maintenance')
--   investigation      - Under investigation due to incident
--   retired            - No longer available (maps to status = 'disabled')

-- ============================================================
-- 1. Add lifecycle_state column to resources
-- ============================================================
alter table public.resources
  add column if not exists lifecycle_state text
    check (lifecycle_state in (
      'draft',
      'pending_verification',
      'available',
      'reserved',
      'checked_out',
      'return_review',
      'maintenance',
      'investigation',
      'retired'
    ));

-- Backfill lifecycle_state from existing status values
--   status = 'active'     -> lifecycle_state = 'available'
--   status = 'maintenance' -> lifecycle_state = 'maintenance'
--   status = 'disabled'    -> lifecycle_state = 'retired'
update public.resources
set lifecycle_state = case status
  when 'active' then 'available'
  when 'maintenance' then 'maintenance'
  when 'disabled' then 'retired'
  else 'available'
end
where lifecycle_state is null;

-- ============================================================
-- 2. Add tags column to resources (for matchmaking)
-- ============================================================
alter table public.resources
  add column if not exists tags text[] default '{}';

-- ============================================================
-- 3. Indexes for lifecycle_state and tags lookups
-- ============================================================
create index if not exists resources_lifecycle_state_idx
  on public.resources (lifecycle_state);

create index if not exists resources_tags_idx
  on public.resources using gin (tags);

-- ============================================================
-- 4. Helper RPC: get_resource_lifecycle_state
--    Returns the effective lifecycle state considering bookings.
--    Used by frontend and other RPCs for consistent availability checks.
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
  select lifecycle_state into v_resource_lifecycle
  from public.resources
  where id = p_resource_id;

  if not found then
    raise exception 'Resource not found';
  end if;

  -- Non-bookable states take precedence regardless of bookings
  if v_resource_lifecycle in (
    'draft',
    'pending_verification',
    'maintenance',
    'investigation',
    'retired'
  ) then
    return v_resource_lifecycle;
  end if;

  -- Check for active bookings
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

  -- Default to stored lifecycle state or 'available'
  return coalesce(v_resource_lifecycle, 'available');
end;
$$;

grant execute on function public.get_resource_lifecycle_state(uuid) to authenticated;
revoke execute on function public.get_resource_lifecycle_state(uuid) from public;
revoke execute on function public.get_resource_lifecycle_state(uuid) from anon;

-- ============================================================
-- 5. Helper RPC: check_resource_availability
--    Checks if a resource is available for a given time range.
--    Considers lifecycle state AND booking overlaps.
-- ============================================================
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
  -- Check effective lifecycle state
  select public.get_resource_lifecycle_state(p_resource_id) into v_resource_state;

  -- Only 'available' or 'reserved' resources can accept new bookings
  -- (reserved means future bookings exist but may not overlap the request)
  if v_resource_state not in ('available', 'reserved') then
    return false;
  end if;

  -- Check for overlapping Approved or Checked Out bookings
  -- Uses the same tstzrange overlap logic as bookings_no_overlap constraint
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
-- 6. Helper RPC: check_borrower_eligibility
--    Checks if a borrower is eligible to book a resource.
--    Reuses the same eligibility logic as create_booking RPC.
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
begin
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
-- End of 006_resource_lifecycle_and_matchmaker.sql
-- ============================================================
