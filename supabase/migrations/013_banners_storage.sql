-- Create banners storage bucket (public read, authenticated write)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'banners',
  'banners',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Allow authenticated users to upload to their own folder
create policy "Users upload own banner"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to update their own banner
create policy "Users update own banner"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text);

-- Allow authenticated users to delete their own banner
create policy "Users delete own banner"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'banners' and (storage.foldername(name))[1] = auth.uid()::text);

-- Anyone can view banners (bucket is public)
create policy "Public banner read"
  on storage.objects for select
  using (bucket_id = 'banners');
