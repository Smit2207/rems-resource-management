-- 008_mission_kits.sql
-- P2 Feature: Mission Kits - reusable groups of resources for common tasks.
--
-- Safe to apply to an existing database that already has migrations 001-007.
-- Does NOT drop or modify any existing tables, columns, constraints, or RPCs.
-- Preserves the bookings_no_overlap exclusion constraint.
-- Preserves all existing RLS policies and function permissions.
--
-- Tables:
--   mission_kits        - Kit definitions (name, description, owner, etc.)
--   mission_kit_items   - Resources assigned to each kit
--
-- RPCs:
--   create_mission_kit      - Create a new kit (authenticated users)
--   add_kit_item            - Add a resource to a kit (kit owner or manager/admin)
--   remove_kit_item         - Remove a resource from a kit (kit owner or manager/admin)
--   delete_mission_kit      - Delete a kit (kit owner or manager/admin)
--   get_my_mission_kits     - List kits owned by the current user

-- ============================================================
-- 1. mission_kits table
-- ============================================================
create table if not exists public.mission_kits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  description text,
  purpose text, -- e.g. "fieldwork", "lab_workshop", "event_setup"
  is_public boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.mission_kits enable row level security;

-- ============================================================
-- 2. mission_kit_items table
-- ============================================================
create table if not exists public.mission_kit_items (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.mission_kits(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete cascade,
  quantity integer default 1 check (quantity > 0),
  added_at timestamptz default now(),
  unique (kit_id, resource_id)
);

alter table public.mission_kit_items enable row level security;

-- ============================================================
-- 3. Indexes
-- ============================================================
create index if not exists mission_kits_owner_id_idx on public.mission_kits (owner_id);
create index if not exists mission_kit_items_kit_id_idx on public.mission_kit_items (kit_id);
create index if not exists mission_kit_items_resource_id_idx on public.mission_kit_items (resource_id);

-- ============================================================
-- 4. RLS policies for mission_kits
-- ============================================================
-- Owners can read/write their own kits; everyone can read public kits
drop policy if exists mission_kits_select_own_or_public on public.mission_kits;
create policy mission_kits_select_own_or_public
  on public.mission_kits for select
  to authenticated
  using (owner_id = auth.uid() or is_public);

drop policy if exists mission_kits_insert_owner on public.mission_kits;
create policy mission_kits_insert_owner
  on public.mission_kits for insert
  to authenticated
  with check (owner_id = auth.uid());

drop policy if exists mission_kits_update_owner on public.mission_kits;
create policy mission_kits_update_owner
  on public.mission_kits for update
  to authenticated
  using (owner_id = auth.uid());

drop policy if exists mission_kits_delete_owner on public.mission_kits;
create policy mission_kits_delete_owner
  on public.mission_kits for delete
  to authenticated
  using (owner_id = auth.uid());

-- Managers/admins can manage all kits
drop policy if exists mission_kits_manage_all on public.mission_kits;
create policy mission_kits_manage_all
  on public.mission_kits for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('manager', 'admin')
    )
  );

-- ============================================================
-- 5. RLS policies for mission_kit_items
-- ============================================================
-- Users can read items from kits they own or public kits
drop policy if exists mission_kit_items_select_kit_access on public.mission_kit_items;
create policy mission_kit_items_select_kit_access
  on public.mission_kit_items for select
  to authenticated
  using (
    exists (
      select 1 from public.mission_kits mk
      where mk.id = mission_kit_items.kit_id
        and (mk.owner_id = auth.uid() or mk.is_public)
    )
  );

-- Kit owners can manage items in their kits
drop policy if exists mission_kit_items_manage_owner on public.mission_kit_items;
create policy mission_kit_items_manage_owner
  on public.mission_kit_items for all
  to authenticated
  using (
    exists (
      select 1 from public.mission_kits mk
      where mk.id = mission_kit_items.kit_id
        and mk.owner_id = auth.uid()
    )
  );

-- Managers/admins can manage all kit items
drop policy if exists mission_kit_items_manage_all on public.mission_kit_items;
create policy mission_kit_items_manage_all
  on public.mission_kit_items for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('manager', 'admin')
    )
  );

-- ============================================================
-- 6. RPCs
-- ============================================================

-- 6a. create_mission_kit
create or replace function public.create_mission_kit(
  p_name text,
  p_description text default null,
  p_purpose text default null,
  p_is_public boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_kit_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.mission_kits (owner_id, name, description, purpose, is_public)
  values (v_actor, p_name, p_description, p_purpose, p_is_public)
  returning id into v_kit_id;

  perform public.audit_write(
    'create_mission_kit',
    'mission_kit',
    v_kit_id,
    format('Created mission kit: %s', p_name),
    jsonb_build_object('name', p_name, 'purpose', p_purpose, 'is_public', p_is_public)
  );

  return v_kit_id;
end;
$$;

grant execute on function public.create_mission_kit(text, text, text, boolean) to authenticated;
revoke execute on function public.create_mission_kit(text, text, text, boolean) from public;
revoke execute on function public.create_mission_kit(text, text, text, boolean) from anon;

-- 6b. add_kit_item
create or replace function public.add_kit_item(
  p_kit_id uuid,
  p_resource_id uuid,
  p_quantity integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_kit_owner uuid;
  v_actor_role text;
  v_item_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select owner_id into v_kit_owner
  from public.mission_kits
  where id = p_kit_id;

  if not found then
    raise exception 'Mission kit not found';
  end if;

  -- Authorization: kit owner or manager/admin
  if v_kit_owner <> v_actor then
    select role into v_actor_role from public.profiles where id = v_actor;
    if not found or v_actor_role not in ('manager', 'admin') then
      raise exception 'Only the kit owner or a manager may add items to this kit';
    end if;
  end if;

  -- Verify resource exists
  if not exists (select 1 from public.resources where id = p_resource_id) then
    raise exception 'Resource not found';
  end if;

  insert into public.mission_kit_items (kit_id, resource_id, quantity)
  values (p_kit_id, p_resource_id, p_quantity)
  on conflict (kit_id, resource_id) do update
  set quantity = mission_kit_items.quantity + excluded.quantity,
      added_at = now()
  returning id into v_item_id;

  perform public.audit_write(
    'add_kit_item',
    'mission_kit_item',
    v_item_id,
    format('Added resource %s to kit %s', p_resource_id, p_kit_id),
    jsonb_build_object('kit_id', p_kit_id, 'resource_id', p_resource_id, 'quantity', p_quantity)
  );

  return v_item_id;
end;
$$;

grant execute on function public.add_kit_item(uuid, uuid, integer) to authenticated;
revoke execute on function public.add_kit_item(uuid, uuid, integer) from public;
revoke execute on function public.add_kit_item(uuid, uuid, integer) from anon;

-- 6c. remove_kit_item
create or replace function public.remove_kit_item(
  p_kit_id uuid,
  p_resource_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_kit_owner uuid;
  v_actor_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select owner_id into v_kit_owner
  from public.mission_kits
  where id = p_kit_id;

  if not found then
    raise exception 'Mission kit not found';
  end if;

  -- Authorization: kit owner or manager/admin
  if v_kit_owner <> v_actor then
    select role into v_actor_role from public.profiles where id = v_actor;
    if not found or v_actor_role not in ('manager', 'admin') then
      raise exception 'Only the kit owner or a manager may remove items from this kit';
    end if;
  end if;

  delete from public.mission_kit_items
  where kit_id = p_kit_id and resource_id = p_resource_id;

  perform public.audit_write(
    'remove_kit_item',
    'mission_kit_item',
    null,
    format('Removed resource %s from kit %s', p_resource_id, p_kit_id),
    jsonb_build_object('kit_id', p_kit_id, 'resource_id', p_resource_id)
  );
end;
$$;

grant execute on function public.remove_kit_item(uuid, uuid) to authenticated;
revoke execute on function public.remove_kit_item(uuid, uuid) from public;
revoke execute on function public.remove_kit_item(uuid, uuid) from anon;

-- 6d. delete_mission_kit
create or replace function public.delete_mission_kit(
  p_kit_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_kit_owner uuid;
  v_actor_role text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select owner_id into v_kit_owner
  from public.mission_kits
  where id = p_kit_id;

  if not found then
    raise exception 'Mission kit not found';
  end if;

  -- Authorization: kit owner or manager/admin
  if v_kit_owner <> v_actor then
    select role into v_actor_role from public.profiles where id = v_actor;
    if not found or v_actor_role not in ('manager', 'admin') then
      raise exception 'Only the kit owner or a manager may delete this kit';
    end if;
  end if;

  delete from public.mission_kits where id = p_kit_id;

  perform public.audit_write(
    'delete_mission_kit',
    'mission_kit',
    p_kit_id,
    format('Deleted mission kit: %s', p_kit_id),
    jsonb_build_object('kit_id', p_kit_id)
  );
end;
$$;

grant execute on function public.delete_mission_kit(uuid) to authenticated;
revoke execute on function public.delete_mission_kit(uuid) from public;
revoke execute on function public.delete_mission_kit(uuid) from anon;

-- 6e. get_my_mission_kits
create or replace function public.get_my_mission_kits()
returns table (
  id uuid,
  owner_id uuid,
  name text,
  description text,
  purpose text,
  is_public boolean,
  created_at timestamptz,
  updated_at timestamptz,
  item_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  return query
  select
    mk.id,
    mk.owner_id,
    mk.name,
    mk.description,
    mk.purpose,
    mk.is_public,
    mk.created_at,
    mk.updated_at,
    coalesce(ki.item_count, 0)
  from public.mission_kits mk
  left join (
    select kit_id, count(*) as item_count
    from public.mission_kit_items
    group by kit_id
  ) ki on ki.kit_id = mk.id
  where mk.owner_id = auth.uid()
  or mk.is_public
  order by mk.created_at desc;
end;
$$;

grant execute on function public.get_my_mission_kits() to authenticated;
revoke execute on function public.get_my_mission_kits() from public;
revoke execute on function public.get_my_mission_kits() from anon;

-- ============================================================
-- End of 008_mission_kits.sql
-- ============================================================
