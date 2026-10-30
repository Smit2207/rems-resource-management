-- 005_p1_schema.sql
-- P1 schema additions for Unlock Underused Equipment and Spaces.
--
-- Safe to apply to an existing database that already has migrations 001-003.
-- Does not drop or modify any existing tables, columns, or constraints.
-- Preserves bookings_no_overlap exclusion constraint.
--
-- Changes:
--   1. Add image_url column to public.resources (for P1.2 resource image uploads)
--   2. Create public.waiting_list table (for P1.4 waiting list feature)
--   3. Add RLS policies for waiting_list
--   4. Add indexes for waiting_list lookups
--   5. Add index on bookings.expected_return_at for overdue queries

-- ============================================================
-- 1. Add image_url column to resources
-- ============================================================
alter table public.resources
  add column if not exists image_url text;

-- ============================================================
-- 2. Waiting list table
-- ============================================================
create table if not exists public.waiting_list (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'active'
    check (status in ('active', 'fulfilled', 'cancelled', 'expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Prevent duplicate active entries for same user/resource/time range
  constraint waiting_list_no_duplicate_active
    exclude using gist (
      resource_id with =,
      user_id with =,
      tstzrange(start_time, end_time) with &&
    )
    where (status = 'active'),

  constraint waiting_list_end_after_start check (end_time > start_time)
);

create index if not exists waiting_list_resource_idx on public.waiting_list (resource_id);
create index if not exists waiting_list_user_idx on public.waiting_list (user_id);
create index if not exists waiting_list_status_idx on public.waiting_list (status);
create index if not exists waiting_list_resource_status_idx on public.waiting_list (resource_id, status);

-- Index on bookings.expected_return_at for overdue queries
create index if not exists bookings_expected_return_idx on public.bookings (expected_return_at);

-- ============================================================
-- 3. Row Level Security for waiting_list
-- ============================================================
alter table public.waiting_list enable row level security;

-- Users can see their own waiting list entries
create policy waiting_list_select_own
  on public.waiting_list for select
  to authenticated
  using (user_id = auth.uid());

-- Resource owners can see waiting list entries for their resources
create policy waiting_list_select_resource_owner
  on public.waiting_list for select
  to authenticated
  using (
    exists (
      select 1 from public.resources r
      where r.id = waiting_list.resource_id
        and r.owner_id = auth.uid()
    )
  );

-- Managers/admins can see all waiting list entries
create policy waiting_list_select_manager_admin
  on public.waiting_list for select
  to authenticated
  using (public.is_manager_or_admin());

-- Users can insert their own waiting list entries
create policy waiting_list_insert_own
  on public.waiting_list for insert
  to authenticated
  with check (user_id = auth.uid());

-- Users can update their own active entries (to cancel)
create policy waiting_list_update_own
  on public.waiting_list for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Users cannot delete waiting list entries (use cancellation instead)
create policy waiting_list_delete_none
  on public.waiting_list for delete
  to authenticated
  using (false);

-- ============================================================
-- 4. Helper: add_waiting_list_entry (SECURITY DEFINER RPC)
--    Validates eligibility and prevents duplicate active entries.
-- ============================================================
create or replace function public.add_waiting_list_entry(
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
  v_user_id uuid := auth.uid();
  v_resource public.resources%rowtype;
  v_profile public.profiles%rowtype;
  v_waiting_list_id uuid;
  v_conflict_count integer;
begin
  -- Explicit authentication precondition
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Validate input
  if p_end_time <= p_start_time then
    raise exception 'End time must be after start time';
  end if;

  -- Resource must exist and be active or disabled (not available but can waitlist)
  select * into v_resource
  from public.resources
  where id = p_resource_id
  for update;

  if not found then
    raise exception 'Resource not found';
  end if;

  -- User profile must exist
  select * into v_profile
  from public.profiles
  where id = v_user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  -- Eligibility: department match (when set)
  if v_resource.eligibility_department is not null
     and v_profile.department is distinct from v_resource.eligibility_department then
    raise exception 'You are not eligible for this resource (department mismatch)';
  end if;

  -- Eligibility: min year (when set)
  if v_resource.eligibility_min_year is not null
     and (v_profile.year_of_study is null or v_profile.year_of_study < v_resource.eligibility_min_year) then
    raise exception 'You are not eligible for this resource (year requirement not met)';
  end if;

  -- Training requirement
  if v_resource.required_training
     and v_resource.training_required is not null
     and not (v_resource.training_required = any(coalesce(v_profile.training_completed, '{}'::text[]))) then
    raise exception 'You have not completed the required training for this resource';
  end if;

  -- Check for duplicate active waiting list entry
  select count(*) into v_conflict_count
  from public.waiting_list
  where resource_id = p_resource_id
    and user_id = v_user_id
    and status = 'active'
    and tstzrange(start_time, end_time) && tstzrange(p_start_time, p_end_time);

  if v_conflict_count > 0 then
    raise exception 'You already have an active waiting list entry for this resource and time range';
  end if;

  -- Insert waiting list entry
  insert into public.waiting_list (resource_id, user_id, start_time, end_time, status)
  values (p_resource_id, v_user_id, p_start_time, p_end_time, 'active')
  returning id into v_waiting_list_id;

  perform public.audit_write(
    'add_waiting_list_entry',
    'waiting_list',
    v_waiting_list_id,
    null,
    jsonb_build_object('resource_id', p_resource_id, 'start_time', p_start_time, 'end_time', p_end_time)
  );

  return v_waiting_list_id;
end;
$$;

-- ============================================================
-- 5. Helper: cancel_waiting_list_entry (SECURITY DEFINER RPC)
-- ============================================================
create or replace function public.cancel_waiting_list_entry(
  p_waiting_list_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.waiting_list%rowtype;
  v_actor uuid := auth.uid();
begin
  -- Explicit authentication precondition
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_entry
  from public.waiting_list
  where id = p_waiting_list_id
  for update;

  if not found then
    raise exception 'Waiting list entry not found';
  end if;

  -- Only the user who created the entry can cancel it
  if v_entry.user_id <> v_actor then
    raise exception 'Only the user who created the waiting list entry may cancel it';
  end if;

  -- Only active entries can be cancelled
  if v_entry.status <> 'active' then
    raise exception 'Only active waiting list entries can be cancelled';
  end if;

  update public.waiting_list
  set status = 'cancelled', updated_at = now()
  where id = p_waiting_list_id;

  perform public.audit_write(
    'cancel_waiting_list_entry',
    'waiting_list',
    p_waiting_list_id,
    null,
    jsonb_build_object('resource_id', v_entry.resource_id)
  );
end;
$$;

-- Grant execute on new RPCs to authenticated
grant execute on function public.add_waiting_list_entry(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.cancel_waiting_list_entry(uuid) to authenticated;

-- Revoke from PUBLIC and anon for new functions
revoke execute on function public.add_waiting_list_entry(uuid, timestamptz, timestamptz) from public;
revoke execute on function public.add_waiting_list_entry(uuid, timestamptz, timestamptz) from anon;
revoke execute on function public.cancel_waiting_list_entry(uuid) from public;
revoke execute on function public.cancel_waiting_list_entry(uuid) from anon;

-- ============================================================
-- End of 005_p1_schema.sql
-- ============================================================
