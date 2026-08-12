-- ONE → FIVE — PROMPT 2 / build spec §8
-- Migration 1 of 4: enums, tables, constraints, indexes, updated_at trigger.

create type public.offer_status as enum (
  'new', 'reviewing', 'shortlisted', 'selected', 'meetup_scheduled',
  'declined', 'did_not_complete', 'completed', 'invalid'
);

create type public.challenge_status as enum ('prelaunch', 'active', 'complete');

create type public.valuation_status as enum ('estimated', 'verified');

-- Admin allowlist. Rows are managed with the service role only (see RLS
-- migration): there are deliberately no public write policies on this table.
create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.followers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  first_name text,
  source text,
  email_updates_opt_in boolean not null default false,
  email_updates_opted_in_at timestamptz,
  email_updates_unsubscribed_at timestamptz,
  trade_interest boolean not null default false,
  trade_interest_at timestamptz,
  public_wall_opt_in boolean not null default false,
  public_display_name text,
  public_general_location text,
  public_visible boolean not null default true,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  landing_variant text,
  created_at timestamptz not null default now(),
  -- spec §4.9: at least one of the two independent choices must be selected
  constraint followers_at_least_one_intent check (email_updates_opt_in or trade_interest)
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  -- snapshot of the authoritative current item at submission time (spec §26)
  offered_against_trade_number integer not null,
  offered_against_item_name text not null,
  offered_against_item_value numeric not null,
  item_name text not null,
  item_description text not null,
  claimed_value numeric not null constraint offers_claimed_value_nonneg check (claimed_value >= 0),
  verified_value numeric,
  condition text not null,
  city text not null,
  state text not null,
  zip text,
  in_person boolean not null,
  travel_distance text,
  serial_or_model text,
  comp_url text constraint offers_comp_url_scheme check (comp_url is null or comp_url ~ '^https?://'),
  why_good_trade text not null,
  ownership_confirmed boolean not null constraint offers_ownership_confirmed check (ownership_confirmed),
  terms_accepted boolean not null constraint offers_terms_accepted check (terms_accepted),
  status public.offer_status not null default 'new',
  meetup_scheduled_at timestamptz,
  meetup_general_location text,
  did_not_complete_reason text,
  last_contacted_at timestamptz,
  internal_notes text,
  verification_method text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  landing_variant text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Public-submission files are item photos only (spec §8.3). No identity,
-- title, or proof-of-ownership documents from public users.
create table public.offer_files (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  storage_path text not null,
  file_type text not null,
  created_at timestamptz not null default now()
);

create table public.trades (
  id uuid primary key default gen_random_uuid(),
  trade_number integer not null unique constraint trades_trade_number_positive check (trade_number > 0),
  source_offer_id uuid references public.offers (id) on delete set null,
  outgoing_item text not null,
  incoming_item text not null,
  outgoing_value numeric not null constraint trades_outgoing_value_nonneg check (outgoing_value >= 0),
  incoming_value numeric not null constraint trades_incoming_value_nonneg check (incoming_value >= 0),
  valuation_status public.valuation_status not null default 'estimated',
  valuation_method text not null,
  valuation_evidence text,
  -- Bitcoin exception (spec §38). The btc_* columns apply only when BTC is
  -- the incoming or outgoing asset. btc_wallet_address/btc_transaction_id are
  -- PRIVATE verification fields and must never appear in public views.
  btc_amount numeric constraint trades_btc_amount_positive check (btc_amount is null or btc_amount > 0),
  btc_usd_value numeric constraint trades_btc_usd_value_positive check (btc_usd_value is null or btc_usd_value > 0),
  btc_valued_at timestamptz,
  btc_valuation_source text,
  btc_wallet_address text,
  btc_transaction_id text,
  public_story text,
  public_participant_name text,
  publicity_release_confirmed boolean not null default false,
  general_location text,
  completed_at timestamptz not null,
  published boolean not null default false,
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint trades_published_has_timestamp check (not published or published_at is not null),
  -- spec §38: every BTC trade records amount + USD FMV + valuation timestamp + source
  constraint trades_btc_recordkeeping check (
    btc_amount is null
    or (btc_usd_value is not null and btc_valued_at is not null and btc_valuation_source is not null)
  ),
  -- private verification fields only make sense on a BTC trade
  constraint trades_btc_private_fields check (
    (btc_wallet_address is null and btc_transaction_id is null) or btc_amount is not null
  ),
  -- spec §30: identifiable participant names require recorded publicity consent
  constraint trades_publicity_consent check (
    public_participant_name is null or publicity_release_confirmed
  )
);

create table public.trade_media (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades (id) on delete cascade,
  storage_path text not null,
  alt_text text,
  sort_order integer not null default 0
);

-- Private/admin-only records for signed receipts/agreements and later
-- professional verification documents (spec §8.6). Never exposed publicly.
create table public.trade_documents (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid not null references public.trades (id) on delete cascade,
  storage_path text not null,
  document_type text not null,
  created_at timestamptz not null default now()
);

-- Single-row configuration (spec §8.7).
create table public.challenge_settings (
  id integer primary key default 1 constraint challenge_settings_single_row check (id = 1),
  title text not null default 'ONE → FIVE',
  subtitle text not null default '$1 → $5,000,000 in 21 Days',
  starting_value numeric not null default 1 constraint challenge_settings_starting_nonneg check (starting_value >= 0),
  target_value numeric not null default 5000000 constraint challenge_settings_target_positive check (target_value > 0),
  start_at timestamptz,
  end_at timestamptz,
  status public.challenge_status not null default 'prelaunch',
  current_item_name text not null default 'One U.S. Dollar',
  current_item_description text,
  current_item_value numeric not null default 1 constraint challenge_settings_current_nonneg check (current_item_value >= 0),
  current_item_image_path text,
  current_item_general_location text,
  current_trade_number integer not null default 0 constraint challenge_settings_trade_number_nonneg check (current_trade_number >= 0),
  offers_paused boolean not null default false,
  follower_signups_paused boolean not null default false,
  public_notice text,
  updated_at timestamptz not null default now(),
  constraint challenge_settings_time_order check (start_at is null or end_at is null or end_at > start_at)
);

create table public.email_broadcasts (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid references public.trades (id) on delete set null,
  subject text not null,
  body_html text not null,
  audience_type text not null constraint email_broadcasts_audience check (
    audience_type in ('ongoing_followers', 'trade_interest', 'all')
  ),
  status text not null default 'draft' constraint email_broadcasts_status check (
    status in ('draft', 'sending', 'sent', 'failed')
  ),
  sent_count integer not null default 0,
  error_count integer not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- Indexes for common admin filtering/sorting and public reads.
create index offers_status_idx on public.offers (status);
create index offers_created_at_idx on public.offers (created_at desc);
create index offers_claimed_value_idx on public.offers (claimed_value desc);
create index offers_target_trade_idx on public.offers (offered_against_trade_number);

create index followers_wall_idx on public.followers (email_updates_opt_in, public_wall_opt_in, public_visible);

create index trades_published_idx on public.trades (published, trade_number desc);

create index trade_media_trade_idx on public.trade_media (trade_id, sort_order);
create index offer_files_offer_idx on public.offer_files (offer_id);
create index trade_documents_trade_idx on public.trade_documents (trade_id);
create index email_broadcasts_trade_idx on public.email_broadcasts (trade_id);
create index email_broadcasts_status_idx on public.email_broadcasts (status);

-- Keep updated_at current on mutable records.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger offers_set_updated_at before update on public.offers
  for each row execute function public.set_updated_at();
create trigger trades_set_updated_at before update on public.trades
  for each row execute function public.set_updated_at();
create trigger challenge_settings_set_updated_at before update on public.challenge_settings
  for each row execute function public.set_updated_at();
