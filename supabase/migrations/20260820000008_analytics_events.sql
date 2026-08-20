-- ONE → FIVE — PROMPT 14 / build spec §13
-- Lightweight, privacy-light analytics: event name + coarse context only.
-- Never stores emails, phone numbers, offer text, uploaded files or any
-- other sensitive form data (spec §13). Writes happen exclusively through
-- the track-event Edge Function (service role); admins may read for future
-- reporting.

create table public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  event text not null constraint analytics_events_name check (
    event in (
      'page_view',
      'follow_cta_clicked',
      'follower_submitted',
      'follower_wall_opt_in',
      'potential_trader_captured',
      'offer_cta_clicked',
      'offer_started',
      'offer_submitted',
      'share_clicked',
      'rules_viewed',
      'trade_detail_viewed'
    )
  ),
  -- Pathname only; query strings are stripped client-side except UTMs,
  -- which live in their own columns.
  path text,
  -- Coarse non-sensitive context, e.g. the share method or a trade number.
  detail text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  created_at timestamptz not null default now()
);

create index analytics_events_event_idx on public.analytics_events (event, created_at desc);
create index analytics_events_created_at_idx on public.analytics_events (created_at desc);

alter table public.analytics_events enable row level security;
grant select on public.analytics_events to authenticated;
grant all on public.analytics_events to service_role;
create policy admin_select on public.analytics_events
  for select to authenticated using (public.is_admin());
