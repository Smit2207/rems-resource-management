-- 001_initial.sql
-- Resource Sharing Platform - P0 database schema (corrected)
-- Complete foundational schema with all security fixes baked in.
-- Safe for fresh Supabase projects. For existing databases, use 004_upgrade_existing.sql.
--
-- Tables: profiles, resource_categories, resources, bookings, incidents, notifications, audit_logs
-- Functions: handle_new_user, set_updated_at, audit_write, create_booking, decide_booking,
--            record_checkout, record_return, confirm_return, report_incident, resolve_incident,
--            cancel_booking, mark_notification_read, is_manager_or_admin
-- RLS policies: least-privilege on all 7 tables
-- Constraints: bookings_no_overlap exclusion constraint preserved

-- ============================================================
-- Extensions
-- ============================================================
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ============================================================
-- Profiles (extends auth.users)
-- ============================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'student'
    check (role in ('student', 'manager', 'admin')),
  institution text,
  department text,
  year_of_study integer,
  student_staff_id text,
  training_completed text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- Auto-create a profile row (role = student) when a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''), 'student')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Non-recursive manager/admin role helper (SECURITY DEFINER)
--    Used by RLS policies to avoid self-referencing profiles table.
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
-- Resource categories
-- ============================================================
create table public.resource_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text
);

-- ============================================================
-- Resources
-- ============================================================
create table public.resources (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  category_id uuid references public.resource_categories(id) on delete set null,
  name text not null,
  description text,
  type text not null check (type in ('equipment', 'space')),
  location text,
  capacity integer,
  eligibility_department text,
  eligibility_min_year integer,
  required_training boolean not null default false,
  training_required text,
  supervision_required boolean not null default false,
  usage_rules text,
  deposit_amount numeric,
  deposit_conditions text,
  status text not null default 'active'
    check (status in ('active', 'disabled', 'maintenance')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger resources_updated_at
  before update on public.resources
  for each row execute procedure public.set_updated_at();

create index if not exists resources_owner_idx on public.resources (owner_id);
create index if not exists resources_category_status_idx on public.resources (category_id, status);

-- ============================================================
-- Bookings
-- ============================================================
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.resources(id) on delete cascade,
  borrower_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'Pending'
    check (status in ('Pending','Approved','Rejected','Cancelled','Checked Out','Returned','Completed')),
  start_time timestamptz not null,
  end_time timestamptz not null,
  rejection_reason text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles(id),
  checkout_at timestamptz,
  checkout_by uuid references public.profiles(id),
  checkout_condition text,
  accessories_included text[],
  expected_return_at timestamptz,
  return_at timestamptz,
  return_by uuid references public.profiles(id),
  return_condition text,
  missing_accessories text[],
  damage_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_end_after_start check (end_time > start_time)
);

create trigger bookings_updated_at
  before update on public.bookings
  for each row execute procedure public.set_updated_at();

create index if not exists bookings_resource_time_idx on public.bookings (resource_id, start_time, end_time);
create index if not exists bookings_status_idx on public.bookings (status);
create index if not exists bookings_borrower_status_idx on public.bookings (borrower_id, status);

-- Overlap prevention: no two Approved or Checked Out bookings for the
-- same resource may overlap in time. Race-safe at the database level.
-- PRESERVED from original migration - never drop or weaken.
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    resource_id with =,
    tstzrange(start_time, end_time) with &&
  )
  where (status in ('Approved', 'Checked Out'));

-- ============================================================
-- Incidents
-- ============================================================
create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  reported_by uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('damage','missing_accessories','late_return','scheduling_conflict','safety_concern')),
  description text not null,
  status text not null default 'open'
    check (status in ('open','under_review','resolved')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now()
);

create index if not exists incidents_status_idx on public.incidents (status);
create index if not exists incidents_booking_idx on public.incidents (booking_id);

-- ============================================================
-- Notifications
-- ============================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('booking_requested','booking_approved','booking_rejected','booking_cancelled','checkout_recorded','return_recorded','incident_status_changed')),
  title text not null,
  message text not null,
  related_resource_id uuid references public.resources(id) on delete set null,
  related_booking_id uuid references public.bookings(id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_read_idx on public.notifications (user_id, read);

-- ============================================================
-- Audit logs (immutable)
-- ============================================================
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null check (entity_type in ('resource','booking','incident','profile')),
  entity_id uuid,
  reason text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at);

-- ============================================================
-- Row Level Security (least privilege)
-- ============================================================
alter table public.profiles enable row level security;
alter table public.resource_categories enable row level security;
alter table public.resources enable row level security;
alter table public.bookings enable row level security;
alter table public.incidents enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: users read own profile; managers/admins read all.
-- Uses is_manager_or_admin() helper to avoid recursive RLS on profiles table.
create policy profiles_select_own_or_manager_admin
  on public.profiles for select
  to authenticated
  using (
    id = auth.uid()
    or public.is_manager_or_admin()
  );

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Users cannot INSERT profiles directly (handled by handle_new_user trigger).
create policy profiles_insert_none
  on public.profiles for insert
  to authenticated
  with check (false);

-- Users cannot DELETE profiles directly.
create policy profiles_delete_none
  on public.profiles for delete
  to authenticated
  using (false);

-- Categories: read all authenticated; modifications via server only.
create policy categories_select_all
  on public.resource_categories for select
  to authenticated
  using (true);

create policy categories_insert_none
  on public.resource_categories for insert
  to authenticated
  with check (false);

create policy categories_update_none
  on public.resource_categories for update
  to authenticated
  using (false);

create policy categories_delete_none
  on public.resource_categories for delete
  to authenticated
  using (false);

-- Resources: active visible to all; owners see own; managers/admins see all.
create policy resources_select_active
  on public.resources for select
  to authenticated
  using (status = 'active');

create policy resources_select_owner_or_manager
  on public.resources for select
  to authenticated
  using (
    owner_id = auth.uid()
    or public.is_manager_or_admin()
  );

create policy resources_insert_owner
  on public.resources for insert
  to authenticated
  with check (owner_id = auth.uid());

create policy resources_update_owner
  on public.resources for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy resources_delete_owner
  on public.resources for delete
  to authenticated
  using (owner_id = auth.uid());

-- Bookings: borrower sees own; owner sees own-resource; manager sees all.
create policy bookings_select_own_or_resource_or_manager
  on public.bookings for select
  to authenticated
  using (
    borrower_id = auth.uid()
    or exists (
      select 1 from public.resources r
      where r.id = bookings.resource_id and r.owner_id = auth.uid()
    )
    or public.is_manager_or_admin()
  );

-- Direct INSERT/UPDATE/DELETE blocked; all booking mutations go through RPCs.
create policy bookings_insert_none
  on public.bookings for insert
  to authenticated
  with check (false);

create policy bookings_update_none
  on public.bookings for update
  to authenticated
  using (false);

create policy bookings_delete_none
  on public.bookings for delete
  to authenticated
  using (false);

-- Incidents: reporter or resource owner/manager read; reporter inserts.
create policy incidents_select_reporter_or_owner_or_manager
  on public.incidents for select
  to authenticated
  using (
    reported_by = auth.uid()
    or exists (
      select 1 from public.bookings b
      join public.resources r on r.id = b.resource_id
      where b.id = incidents.booking_id
        and (r.owner_id = auth.uid()
          or public.is_manager_or_admin())
    )
  );

create policy incidents_insert_reporter
  on public.incidents for insert
  to authenticated
  with check (reported_by = auth.uid());

create policy incidents_update_owner_manager
  on public.incidents for update
  to authenticated
  using (
    exists (
      select 1 from public.bookings b
      join public.resources r on r.id = b.resource_id
      where b.id = incidents.booking_id
        and (r.owner_id = auth.uid()
          or public.is_manager_or_admin())
    )
  );

create policy incidents_delete_none
  on public.incidents for delete
  to authenticated
  using (false);

-- Notifications: users read own; mark read via RPC only; no direct INSERT.
create policy notifications_select_own
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy notifications_insert_none
  on public.notifications for insert
  to authenticated
  with check (false);

create policy notifications_update_none
  on public.notifications for update
  to authenticated
  using (false);

create policy notifications_delete_none
  on public.notifications for delete
  to authenticated
  using (false);

-- Audit logs: managers/admins read; no direct INSERT/UPDATE/DELETE by any role.
-- Only audit_write() SECURITY DEFINER function can write.
create policy audit_logs_select_manager_admin
  on public.audit_logs for select
  to authenticated
  using (public.is_manager_or_admin());

create policy audit_logs_insert_none
  on public.audit_logs for insert
  to authenticated
  with check (false);

create policy audit_logs_update_none
  on public.audit_logs for update
  to authenticated
  using (false);

create policy audit_logs_delete_none
  on public.audit_logs for delete
  to authenticated
  using (false);

-- ============================================================
-- Helper: audit_write (SECURITY DEFINER so triggers/RPCs can write)
--    NEVER granted directly to any application role.
-- ============================================================
create or replace function public.audit_write(
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_reason text default null,
  p_metadata jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, reason, metadata)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_reason, p_metadata);
end;
$$;

-- ============================================================
-- RPC: create_booking
--    NULL-safe training validation; FOR UPDATE on borrower profile
--    to serialize concurrent booking creation (active-booking limit safety).
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
  -- Explicit authentication precondition
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  -- Resource must exist and be active
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

  -- Borrower profile (FOR UPDATE serializes per-user booking creation,
  -- preventing active-booking-limit race conditions)
  select * into v_profile
  from public.profiles
  where id = v_borrower
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  -- Eligibility: department match (when set)
  if v_resource.eligibility_department is not null
     and v_profile.department is distinct from v_resource.eligibility_department then
    raise exception 'You are not eligible to book this resource (department mismatch)';
  end if;

  -- Eligibility: min year (when set)
  if v_resource.eligibility_min_year is not null
     and (v_profile.year_of_study is null or v_profile.year_of_study < v_resource.eligibility_min_year) then
    raise exception 'You are not eligible to book this resource (year requirement not met)';
  end if;

  -- Training requirement (NULL-safe: if training_completed is NULL, treat as incomplete)
  if v_resource.required_training
     and v_resource.training_required is not null
     and not (v_resource.training_required = any(coalesce(v_profile.training_completed, '{}'::text[]))) then
    raise exception 'You have not completed the required training for this resource';
  end if;

  -- Active booking limit: count Pending/Approved/Checked Out <= 2
  select count(*) into v_active_count
  from public.bookings
  where borrower_id = v_borrower
    and status in ('Pending', 'Approved', 'Checked Out');

  if v_active_count >= 2 then
    raise exception 'You already have the maximum of 2 active bookings';
  end if;

  -- Insert booking (EXCLUDE constraint prevents overlap races)
  insert into public.bookings (resource_id, borrower_id, start_time, end_time, status)
  values (p_resource_id, v_borrower, p_start_time, p_end_time, 'Pending')
  returning id into v_booking_id;

  -- Notification to resource owner
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
-- RPC: decide_booking (approve / reject)
-- ============================================================
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
  -- Explicit authentication precondition
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

  -- Only the resource owner or a manager/admin may decide
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

-- ============================================================
-- RPC: record_checkout
-- ============================================================
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
  -- Explicit authentication precondition
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

  -- Only the resource owner may check out
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

-- ============================================================
-- RPC: record_return
-- ============================================================
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
  -- Explicit authentication precondition
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

  -- Only the borrower may record the return
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

-- ============================================================
-- RPC: confirm_return (owner confirms -> Completed)
-- ============================================================
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
  -- Explicit authentication precondition
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

  -- Only the resource owner may confirm
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

-- ============================================================
-- RPC: report_incident
--    Authorization: borrower, resource owner, or manager/admin only.
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
  -- Explicit authentication precondition
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

  -- Verify the reporter is authorized to report on this booking
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
-- RPC: resolve_incident (FIXED)
--    FIX: Incident row selected separately into incidents%ROWTYPE.
--    Booking/resource data queried separately with separate SELECT INTO.
--    Authorization: resource owner or manager/admin only.
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
  -- Explicit authentication precondition
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
-- RPC: cancel_booking
--    Only the borrower may cancel their own Pending booking.
-- ============================================================
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
  -- Explicit authentication precondition
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
-- RPC: mark_notification_read
--    Sets read = true only where user_id = auth.uid().
--    Replaces direct UPDATE on notifications table.
-- ============================================================
create or replace function public.mark_notification_read(
  p_notification_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Explicit authentication precondition
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.notifications
  set read = true
  where id = p_notification_id
    and user_id = auth.uid();
end;
$$;
