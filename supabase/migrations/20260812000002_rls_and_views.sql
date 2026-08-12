-- ONE → FIVE — PROMPT 2 / build spec §9, §24
-- Migration 2 of 4: RLS, admin policies, public-safe views.
--
-- Access model:
--   * anon        → nothing on tables; SELECT on the public-safe views only.
--   * authenticated non-admin → nothing (RLS denies everything).
--   * authenticated admin (listed in app_admins) → full access to all tables.
--   * service_role → bypasses RLS; used only by Supabase Edge Functions.
--   * Public submissions (offers, email preferences) go through Edge
--     Functions using the service role — there are no public INSERT policies.

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.app_admins a
    where a.user_id = auth.uid()
  );
$$;

-- app_admins: any signed-in user may read the (uuid-only) list so policies
-- can evaluate; writes are service-role-only (no write policies exist).
alter table public.app_admins enable row level security;
create policy app_admins_read on public.app_admins
  for select to authenticated using (true);

-- All challenge data tables: RLS on, admin-only policies, explicit grants so
-- behavior does not depend on project default-privilege settings.
do $$
declare
  t text;
begin
  foreach t in array array[
    'followers', 'offers', 'offer_files', 'trades', 'trade_media',
    'trade_documents', 'challenge_settings', 'email_broadcasts'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('create policy admin_select on public.%I for select to authenticated using (public.is_admin())', t);
    execute format('create policy admin_insert on public.%I for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy admin_update on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('create policy admin_delete on public.%I for delete to authenticated using (public.is_admin())', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public-safe views (spec §24). These intentionally expose only approved
-- fields; private columns (offer contact data, valuation evidence, BTC
-- wallet address/transaction id, admin flags) are omitted.
-- ---------------------------------------------------------------------------

-- Published trades only. source_offer_id, valuation_evidence,
-- btc_wallet_address, btc_transaction_id, publicity_release_confirmed are
-- deliberately excluded.
create view public.public_trades as
select
  t.id,
  t.trade_number,
  t.outgoing_item,
  t.incoming_item,
  t.outgoing_value,
  t.incoming_value,
  t.valuation_status,
  t.valuation_method,
  t.btc_amount,
  t.btc_usd_value,
  t.btc_valued_at,
  t.btc_valuation_source,
  t.public_story,
  t.public_participant_name,
  t.general_location,
  t.completed_at,
  t.published_at
from public.trades t
where t.published = true;

create view public.public_trade_media as
select m.id, m.trade_id, m.storage_path, m.alt_text, m.sort_order
from public.trade_media m
join public.trades t on t.id = m.trade_id
where t.published = true;

create view public.public_challenge_settings as
select
  title,
  subtitle,
  starting_value,
  target_value,
  start_at,
  end_at,
  status,
  current_item_name,
  current_item_description,
  current_item_value,
  current_item_image_path,
  current_item_general_location,
  current_trade_number,
  offers_paused,
  follower_signups_paused,
  public_notice,
  updated_at
from public.challenge_settings
where id = 1;

-- Follower wall: only people who are still active ongoing-email followers
-- AND explicitly opted into public display AND remain admin-visible.
create view public.public_follower_wall as
select public_display_name, public_general_location, created_at
from public.followers
where email_updates_opt_in = true
  and email_updates_unsubscribed_at is null
  and public_wall_opt_in = true
  and public_visible = true
  and public_display_name is not null
order by created_at desc;

-- Public follower count counts only active ongoing-email followers (spec §4.10).
create view public.public_follower_count as
select count(*)::integer as follower_count
from public.followers
where email_updates_opt_in = true
  and email_updates_unsubscribed_at is null;

grant select on
  public.public_trades,
  public.public_trade_media,
  public.public_challenge_settings,
  public.public_follower_wall,
  public.public_follower_count
to anon, authenticated;
