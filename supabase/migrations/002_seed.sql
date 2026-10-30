-- 002_seed.sql
-- Seed data for the Resource Sharing Platform P0 demo.
-- Idempotent: safe to rerun without creating duplicate records.
-- Does NOT insert into auth.users (unsupported via Supabase SQL Editor).
-- Users must sign up through the application first; the handle_new_user
-- trigger auto-creates profiles. This seed adds profiles, categories,
-- resources, and bookings using actual database IDs resolved by lookup.
--
-- Dependency order: profiles → categories → resources → bookings

-- ------------------------------------------------------------------
-- Profiles
--    Only insert if the corresponding auth.user exists (created via
--    app signup, which fires handle_new_user trigger).
--    Roles are set explicitly (manager/admin override trigger default).
-- ------------------------------------------------------------------
do $$
declare
  v_alice_id uuid;
  v_bob_id uuid;
  v_carol_id uuid;
  v_dave_id uuid;
begin
  select id into v_alice_id from auth.users where email = 'alice@college.edu';
  select id into v_bob_id from auth.users where email = 'bob@college.edu';
  select id into v_carol_id from auth.users where email = 'carol@college.edu';
  select id into v_dave_id from auth.users where email = 'dave@college.edu';

  if v_alice_id is not null then
    insert into public.profiles (id, email, full_name, role, institution, department, year_of_study, student_staff_id, training_completed)
    values (v_alice_id, 'alice@college.edu', 'Alice Chen', 'student', 'College of Engineering', 'Computer Science', 3, 'ENG-3001', array['lab_safety'])
    on conflict (id) do update set
      email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role,
      institution = excluded.institution,
      department = excluded.department,
      year_of_study = excluded.year_of_study,
      student_staff_id = excluded.student_staff_id,
      training_completed = excluded.training_completed;
  end if;

  if v_bob_id is not null then
    insert into public.profiles (id, email, full_name, role, institution, department, year_of_study, student_staff_id, training_completed)
    values (v_bob_id, 'bob@college.edu', 'Bob Rivera', 'manager', 'College of Engineering', 'Computer Science', null, 'STAFF-2001', array[]::text[])
    on conflict (id) do update set
      email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role,
      institution = excluded.institution,
      department = excluded.department,
      year_of_study = excluded.year_of_study,
      student_staff_id = excluded.student_staff_id,
      training_completed = excluded.training_completed;
  end if;

  if v_carol_id is not null then
    insert into public.profiles (id, email, full_name, role, institution, department, year_of_study, student_staff_id, training_completed)
    values (v_carol_id, 'carol@college.edu', 'Carol Mbeki', 'manager', 'College of Engineering', 'Administration', null, 'STAFF-3001', array[]::text[])
    on conflict (id) do update set
      email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role,
      institution = excluded.institution,
      department = excluded.department,
      year_of_study = excluded.year_of_study,
      student_staff_id = excluded.student_staff_id,
      training_completed = excluded.training_completed;
  end if;

  if v_dave_id is not null then
    insert into public.profiles (id, email, full_name, role, institution, department, year_of_study, student_staff_id, training_completed)
    values (v_dave_id, 'dave@college.edu', 'Dave Okoro', 'admin', 'College of Engineering', 'IT Services', null, 'STAFF-4001', array[]::text[])
    on conflict (id) do update set
      email = excluded.email,
      full_name = excluded.full_name,
      role = excluded.role,
      institution = excluded.institution,
      department = excluded.department,
      year_of_study = excluded.year_of_study,
      student_staff_id = excluded.student_staff_id,
      training_completed = excluded.training_completed;
  end if;
end $$;

-- ------------------------------------------------------------------
-- Resource categories (idempotent via ON CONFLICT on slug)
-- ------------------------------------------------------------------
insert into public.resource_categories (name, slug, description) values
  ('Lab Equipment', 'lab-equipment', 'Scientific and laboratory equipment'),
  ('Meeting Room', 'meeting-room', 'Bookable meeting and seminar spaces'),
  ('AV Equipment', 'av-equipment', 'Audio-visual and presentation gear'),
  ('Space', 'space', 'General spaces and facilities')
on conflict (slug) do nothing;

-- ------------------------------------------------------------------
-- Resources and demo bookings (owned by Bob)
--    Uses actual database IDs resolved by email/name lookups.
--    Idempotent: checks for existing resources/bookings before inserting.
-- ------------------------------------------------------------------
do $$
declare
  v_bob_id uuid;
  v_alice_id uuid;
  v_cat_lab uuid;
  v_cat_av uuid;
  v_cat_room uuid;
  v_mic uuid;
  v_proj uuid;
  v_hall uuid;
begin
  -- Resolve actual IDs from database
  select id into v_bob_id from public.profiles where email = 'bob@college.edu';
  select id into v_alice_id from public.profiles where email = 'alice@college.edu';
  select id into v_cat_lab from public.resource_categories where slug = 'lab-equipment';
  select id into v_cat_av from public.resource_categories where slug = 'av-equipment';
  select id into v_cat_room from public.resource_categories where slug = 'meeting-room';

  -- Olympus Microscope
  select id into v_mic from public.resources where name = 'Olympus Microscope – Lab 301';
  if v_mic is null and v_bob_id is not null and v_cat_lab is not null then
    insert into public.resources (owner_id, category_id, name, description, type, location, capacity,
      eligibility_department, eligibility_min_year, required_training, training_required, supervision_required, usage_rules, status)
    values (v_bob_id, v_cat_lab, 'Olympus Microscope – Lab 301',
      'Compound light microscope for biology lab work. Requires lab safety training.',
      'equipment', 'Lab 301', 1, 'Computer Science', 2, true, 'lab_safety', false,
      'Return slides and cable. No food or drink near the instrument.', 'active')
    returning id into v_mic;
  end if;

  -- Projector
  select id into v_proj from public.resources where name = 'Projector Epson EB-X51';
  if v_proj is null and v_bob_id is not null and v_cat_av is not null then
    insert into public.resources (owner_id, category_id, name, description, type, location, capacity,
      required_training, training_required, supervision_required, usage_rules, status)
    values (v_bob_id, v_cat_av, 'Projector Epson EB-X51',
      'Portable projector with HDMI and VGA input.',
      'equipment', 'Media Store', 1, false, null, false,
      'Collect remote and cable from media store.', 'active')
    returning id into v_proj;
  end if;

  -- Seminar Hall
  select id into v_hall from public.resources where name = 'Seminar Hall A';
  if v_hall is null and v_bob_id is not null and v_cat_room is not null then
    insert into public.resources (owner_id, category_id, name, description, type, location, capacity,
      eligibility_department, eligibility_min_year, usage_rules, status)
    values (v_bob_id, v_cat_room, 'Seminar Hall A',
      'Seminar hall with whiteboard and projector.',
      'space', 'Building A, 1st floor', 60, 'Computer Science', 2,
      'Book in whole-hour slots. Rearrange furniture with care.', 'active')
    returning id into v_hall;
  end if;

  -- Pre-existing Approved booking (overlap demo): Tue 10:00-12:00 next week
  if v_mic is not null and v_alice_id is not null then
    if not exists (
      select 1 from public.bookings
      where resource_id = v_mic and borrower_id = v_alice_id
        and status = 'Approved'
    ) then
      insert into public.bookings (resource_id, borrower_id, status, start_time, end_time, decided_at, decided_by)
      values (v_mic, v_alice_id, 'Approved',
        (select (date_trunc('week', now()) + interval '1 day' + interval '10 hours') at time zone 'UTC'),
        (select (date_trunc('week', now()) + interval '1 day' + interval '12 hours') at time zone 'UTC'),
        now(), v_bob_id);
    end if;
  end if;

  -- Overdue booking (manager demo): Checked Out, expected return in the past
  if v_proj is not null and v_alice_id is not null then
    if not exists (
      select 1 from public.bookings
      where resource_id = v_proj and borrower_id = v_alice_id
        and status = 'Checked Out'
    ) then
      insert into public.bookings (resource_id, borrower_id, status, start_time, end_time, checkout_at, checkout_by, expected_return_at, decided_at, decided_by)
      values (v_proj, v_alice_id, 'Checked Out',
        now() - interval '3 days', now() - interval '1 day',
        now() - interval '3 days', v_bob_id,
        now() - interval '1 day', now() - interval '3 days', v_bob_id);
    end if;
  end if;
end $$;
