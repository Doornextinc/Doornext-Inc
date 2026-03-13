-- Create menu-items storage bucket (public read, authenticated write)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'menu-items',
  'menu-items',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Authenticated users can upload to their own folder
create policy "Makers upload menu item photos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'menu-items' and (storage.foldername(name))[1] = auth.uid()::text);

-- Authenticated users can replace their own files
create policy "Makers update menu item photos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'menu-items' and (storage.foldername(name))[1] = auth.uid()::text);

-- Authenticated users can delete their own files
create policy "Makers delete menu item photos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'menu-items' and (storage.foldername(name))[1] = auth.uid()::text);

-- Anyone can view menu item photos (bucket is public)
create policy "Public menu item photo read"
  on storage.objects for select
  using (bucket_id = 'menu-items');
