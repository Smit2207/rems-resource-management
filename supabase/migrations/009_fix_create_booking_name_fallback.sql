-- 009_fix_create_booking_name_fallback.sql
-- Hotfix: PostgreSQL OR accepts boolean expressions only. The previous
-- create_booking function incorrectly used text "full_name OR email" in
-- its notification message. Prefer a non-empty full name, otherwise email.
--
-- Safe to apply to an existing database after the REMS lifecycle functions
-- from migration 007 are installed. This replaces only create_booking and
-- preserves its validation, booking limit, overlap constraint, notifications,
-- audit logging, lifecycle handling and authenticated-only execution.

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
      coalesce(nullif(v_profile.full_name, ''), v_profile.email),
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
