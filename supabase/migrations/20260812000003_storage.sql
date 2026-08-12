-- ONE → FIVE — PROMPT 2 / build spec §5.3, §34
-- Migration 3 of 4: storage buckets + storage RLS policies.
--
--   offer-uploads  private  — anonymous offer photos. Writes happen only via
--                              service-role Edge Functions (randomized paths);
--                              reads only for admins (signed URLs).
--   trade-media    public   — published trade images. Public read; writes
--                              by admin (JWT) or service-role Edge Functions.

insert into storage.buckets (id, name, public)
values
  ('offer-uploads', 'offer-uploads', false),
  ('trade-media', 'trade-media', true)
on conflict (id) do nothing;

-- offer-uploads: no anon access at all; admins may list/read (signed URLs).
create policy offer_uploads_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'offer-uploads' and public.is_admin());

-- No insert/update/delete policies on offer-uploads: only the service role
-- (which bypasses RLS, used by the offer-submission Edge Function) can write.

-- trade-media: public read of published trade images.
create policy trade_media_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'trade-media');

create policy trade_media_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'trade-media' and public.is_admin());

create policy trade_media_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'trade-media' and public.is_admin())
  with check (bucket_id = 'trade-media' and public.is_admin());

create policy trade_media_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'trade-media' and public.is_admin());
