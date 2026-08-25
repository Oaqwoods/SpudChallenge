-- ONE → FIVE — PROMPT 28 / volume + upload hardening
-- Migration 13: server-enforced per-object file-size limits.
--
-- Until now the 10 MB cap was only validated against the CLIENT-DECLARED
-- size when an upload URL was issued (issueOfferUpload) and on the admin
-- client before trade-media uploads. A dishonest client could declare a
-- small size and then push a larger object through the signed URL. Supabase
-- Storage supports a bucket-level file_size_limit; setting it makes the cap
-- structural for every write path (signed URL or otherwise).
--
-- Defensive: file_size_limit exists on current Supabase versions; on an
-- older storage schema the migration degrades to a notice instead of
-- failing, leaving the issuance-time check as the enforcement point.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'storage'
      and table_name = 'buckets'
      and column_name = 'file_size_limit'
  ) then
    update storage.buckets
    set file_size_limit = 10485760 -- 10 MB, matching MAX_FILE_BYTES
    where id in ('offer-uploads', 'trade-media');
  else
    raise notice 'storage.buckets.file_size_limit is unavailable on this Supabase version; the 10 MB cap remains enforced at upload-URL issuance only';
  end if;
end;
$$;
