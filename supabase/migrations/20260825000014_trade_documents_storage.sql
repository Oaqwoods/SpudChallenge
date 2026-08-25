-- ONE → FIVE — PROMPT 29 / valuation + publicity consent
-- Migration 14: private storage bucket for admin-added verification
-- documents (spec §8.6). The trade_documents table has existed since
-- migration 1; this adds the storage it points at.
--
--   trade-documents  private — signed receipts/agreements and later
--                              professional verification documents. Admin
--                              uploads (JWT) only; reads only through
--                              short-lived signed URLs for admins. Never
--                              referenced by any public view.

insert into storage.buckets (id, name, public)
values ('trade-documents', 'trade-documents', false)
on conflict (id) do nothing;

-- Same 10 MB server-enforced cap as the other buckets (prompt 28 pattern).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'file_size_limit'
  ) then
    update storage.buckets
    set file_size_limit = 10485760
    where id = 'trade-documents';
  else
    raise notice 'storage.buckets.file_size_limit is unavailable on this Supabase version; documents are capped client-side only';
  end if;
end;
$$;

-- Admin-only policies; there is no anon access at all. Delete is included
-- (like trade_media) so a mistakenly uploaded document can be replaced —
-- business records remain undeletable per prompt 27.
create policy trade_documents_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'trade-documents' and public.is_admin());

create policy trade_documents_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'trade-documents' and public.is_admin());

create policy trade_documents_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'trade-documents' and public.is_admin());
