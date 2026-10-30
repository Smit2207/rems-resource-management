-- ============================================================================
-- Supabase Storage setup for the `resource-images` bucket
//
// Purpose: Provision the storage bucket used by ImageUpload.tsx for resource
//          image uploads, with Row Level Security policies.
//
// How to apply (manual step — do NOT run automatically):
//   1. Open your Supabase project dashboard.
//   2. Go to SQL Editor.
//   3. Paste and run the entire contents of this file.
//   4. Alternatively, create the bucket via Storage → Buckets in the dashboard
//      and add the policies below under Storage → Policies.
//
// Idempotency: safe to run multiple times. Uses ON CONFLICT for the bucket
//              and DROP POLICY IF EXISTS before creating each policy.
//
// ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Create the `resource-images` bucket (public read) if it does not exist.
--    Public read allows unauthenticated visitors to view resource images.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values (gen_random_uuid(), 'resource-images', true)
on conflict (name) do update set public = true;

-- ---------------------------------------------------------------------------
-- 2. Storage policies on `storage.objects` for the `resource-images` bucket.
-- ---------------------------------------------------------------------------

-- Public read: anyone can view objects.
drop policy if exists "Public read access for resource images" on storage.objects;
create policy "Public read access for resource images"
on storage.objects
for select
to public
using ( bucket_id = 'resource-images' );

-- Insert: only authenticated users may upload objects.
drop policy if exists "Authenticated users can upload resource images" on storage.objects;
create policy "Authenticated users can upload resource images"
on storage.objects
for insert
to authenticated
with check ( bucket_id = 'resource-images' );

-- Update: only the object owner (first path segment == user id) may update.
drop policy if exists "Users can update their own resource images" on storage.objects;
create policy "Users can update their own resource images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'resource-images'
  and auth.uid()::text = split_part(name, '/', 1)
)
with check (
  bucket_id = 'resource-images'
  and auth.uid()::text = split_part(name, '/', 1)
);

-- Delete: only the object owner may delete.
drop policy if exists "Users can delete their own resource images" on storage.objects;
create policy "Users can delete their own resource images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'resource-images'
  and auth.uid()::text = split_part(name, '/', 1)
);

-- ============================================================================
-- Notes:
--   - Anonymous upload is NOT granted (no policy for `to anon` on insert).
--   - Users can only modify/delete objects under their own `user_id/` folder,
--     matching the upload path `${user.id}/${uuid}.${ext}` used by ImageUpload.
--   - If the bucket already exists with `public = false`, the upsert above
--     flips it to public so images are viewable without signed URLs.
-- ============================================================================
