-- Buckets. Paths are "<user_id>/<file>" so ownership is checkable from the name.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('swing-videos', 'swing-videos', false, 524288000, array['video/mp4', 'video/quicktime', 'video/webm']),
  ('analysis-frames', 'analysis-frames', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('match-videos', 'match-videos', false, 2147483648, array['video/mp4', 'video/quicktime', 'video/webm']),
  ('racket-photos', 'racket-photos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('reels', 'reels', true, 209715200, array['video/mp4', 'video/quicktime', 'video/webm'])
on conflict (id) do nothing;

create policy "avatars: owner writes" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner updates" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "racket photos: owner writes" on storage.objects for insert to authenticated
  with check (bucket_id = 'racket-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "racket photos: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id = 'racket-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "videos: owner uploads" on storage.objects for insert to authenticated
  with check (bucket_id in ('swing-videos', 'match-videos') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "videos: owner deletes" on storage.objects for delete to authenticated
  using (bucket_id in ('swing-videos', 'match-videos', 'analysis-frames') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "videos & frames: owner or their coach reads" on storage.objects for select to authenticated
  using (bucket_id in ('swing-videos', 'match-videos', 'analysis-frames')
         and public.can_view_player(((storage.foldername(name))[1])::uuid));
