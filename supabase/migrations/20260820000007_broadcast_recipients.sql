-- ONE → FIVE — PROMPT 12 / build spec §7.3
-- Per-recipient send log for email broadcasts. This is what makes sending
-- safe to retry: a recipient already logged as 'sent' is never emailed again
-- for the same broadcast, and every status/error is auditable.

create table public.email_broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.email_broadcasts (id) on delete cascade,
  follower_id uuid references public.followers (id) on delete set null,
  email text not null,
  status text not null default 'pending' constraint email_broadcast_recipients_status check (
    status in ('pending', 'sent', 'failed')
  ),
  -- Resend message id for sent mail (support/deliverability lookups).
  resend_id text,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_broadcast_recipients_one_per_address unique (broadcast_id, email)
);

create index email_broadcast_recipients_broadcast_idx
  on public.email_broadcast_recipients (broadcast_id, status);

create trigger email_broadcast_recipients_set_updated_at before update
  on public.email_broadcast_recipients
  for each row execute function public.set_updated_at();

-- Same access model as the other challenge tables (migration 2): admins only,
-- service_role for Edge Functions, nothing for anon.
alter table public.email_broadcast_recipients enable row level security;
grant select, insert, update, delete on public.email_broadcast_recipients to authenticated;
grant all on public.email_broadcast_recipients to service_role;
create policy admin_select on public.email_broadcast_recipients
  for select to authenticated using (public.is_admin());
create policy admin_insert on public.email_broadcast_recipients
  for insert to authenticated with check (public.is_admin());
create policy admin_update on public.email_broadcast_recipients
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy admin_delete on public.email_broadcast_recipients
  for delete to authenticated using (public.is_admin());
