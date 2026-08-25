-- ONE → FIVE — PROMPT 27 / admin safety + recovery
-- Migration 12: idempotent publish replay, safe edit of published trades,
-- and a database-level lockdown against hard deletes of business records.
--
-- 1. publish_trade becomes idempotent on replay: when the offer is already
--    completed and a trade exists for it, the RPC returns the existing
--    trade instead of raising. A double-click or a network retry after the
--    server already committed must never create a second trade AND must not
--    report failure.
-- 2. update_published_trade(...) is the single safe correction path for a
--    published trade (typo/photo/story, participant name, location, items,
--    values). Historical value changes are rejected unless the caller passes
--    an explicit confirmation flag; BTC trades hold a frozen USD FMV and
--    their values cannot be edited at all. When the corrected trade is the
--    current trade, the homepage settings row is re-synced in the same
--    transaction.
-- 3. No normal hard deletes: the admin_delete policies and DELETE grants
--    are removed from offers, followers, trades and the broadcast
--    recipient send-log. trade_media keeps DELETE because replacing a
--    trade's public photo set (below) rewrites media rows.

-- ---------------------------------------------------------------------------
-- 1. publish_trade with idempotent replay
-- ---------------------------------------------------------------------------
-- Full re-issue of migration 6's body; the only behavioral addition is the
-- completed-replay block right after the offer row is locked.

create or replace function public.publish_trade(
  p_offer_id uuid,
  p_outgoing_item text,
  p_incoming_item text,
  p_outgoing_value numeric,
  p_incoming_value numeric,
  p_valuation_method text,
  p_valuation_evidence text,
  p_completed_at timestamptz,
  p_general_location text,
  p_public_story text,
  p_public_participant_name text,
  p_publicity_release_confirmed boolean,
  p_private_completion_notes text,
  p_incoming_item_description text default null,
  p_media jsonb default '[]'::jsonb,
  p_btc_side text default null,
  p_btc_amount numeric default null,
  p_btc_usd_value numeric default null,
  p_btc_valued_at timestamptz default null,
  p_btc_valuation_source text default null,
  p_btc_wallet_address text default null,
  p_btc_transaction_id text default null,
  p_draft_subject text default null,
  p_draft_body_html text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_settings public.challenge_settings%rowtype;
  v_offer public.offers%rowtype;
  v_trade_number integer;
  v_trade_id uuid;
  v_first_media_path text;
  v_entry jsonb;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Required public fields ------------------------------------------------
  if p_outgoing_item is null or btrim(p_outgoing_item) = '' then
    raise exception 'the item given away is required';
  end if;
  if p_incoming_item is null or btrim(p_incoming_item) = '' then
    raise exception 'the item received is required';
  end if;
  if p_valuation_method is null or btrim(p_valuation_method) = '' then
    raise exception 'the valuation method is required';
  end if;
  if p_general_location is null or btrim(p_general_location) = '' then
    raise exception 'a public general location is required';
  end if;
  if p_completed_at is null then
    raise exception 'the completion date/time is required';
  end if;
  if p_outgoing_value is null or p_outgoing_value < 0 then
    raise exception 'the outgoing value must be zero or more';
  end if;
  if p_incoming_value is null or p_incoming_value < 0 then
    raise exception 'the incoming value must be zero or more';
  end if;

  -- Publicity consent (spec §32): an identifiable participant name may only
  -- be published with recorded consent.
  if p_public_participant_name is not null
     and btrim(p_public_participant_name) <> ''
     and not coalesce(p_publicity_release_confirmed, false) then
    raise exception 'publicity release confirmation is required when a participant name is published';
  end if;

  -- Bitcoin exception (spec §38): the recorded USD FMV is the frozen public
  -- challenge value for the BTC side of the trade.
  if p_btc_amount is not null then
    if p_btc_amount <= 0 then
      raise exception 'btc amount must be positive';
    end if;
    if p_btc_side is null or p_btc_side not in ('incoming', 'outgoing') then
      raise exception 'btc side must be "incoming" or "outgoing" when a btc amount is set';
    end if;
    if p_btc_usd_value is null or p_btc_usd_value <= 0
       or p_btc_valued_at is null
       or p_btc_valuation_source is null or btrim(p_btc_valuation_source) = '' then
      raise exception 'btc trades require the usd fair-market value, valuation timestamp and valuation source';
    end if;
    if p_btc_side = 'incoming' and p_incoming_value <> p_btc_usd_value then
      raise exception 'the incoming value must equal the frozen btc usd fair-market value';
    end if;
    if p_btc_side = 'outgoing' and p_outgoing_value <> p_btc_usd_value then
      raise exception 'the outgoing value must equal the frozen btc usd fair-market value';
    end if;
  else
    if p_btc_usd_value is not null or p_btc_valued_at is not null
       or p_btc_valuation_source is not null then
      raise exception 'btc valuation fields require a btc amount';
    end if;
    if p_btc_wallet_address is not null or p_btc_transaction_id is not null then
      raise exception 'private btc wallet/transaction fields require a btc amount';
    end if;
  end if;

  -- Lock the settings row: concurrent publishes serialize here.
  select * into v_settings
  from public.challenge_settings
  where id = 1
  for update;
  if not found then
    raise exception 'challenge settings row is missing';
  end if;

  select * into v_offer
  from public.offers
  where id = p_offer_id
  for update;
  if not found then
    raise exception 'offer not found';
  end if;

  -- Idempotent replay (prompt 27): the offer row lock above serializes
  -- concurrent attempts; the first one commits the trade, and every later
  -- attempt with the same offer lands here and returns the existing trade.
  if v_offer.status = 'completed' then
    select t.id, t.trade_number into v_trade_id, v_trade_number
    from public.trades t
    where t.source_offer_id = p_offer_id
    order by t.trade_number asc
    limit 1;
    if found then
      return jsonb_build_object('trade_id', v_trade_id, 'trade_number', v_trade_number);
    end if;
    raise exception 'this offer is already completed but has no published trade — contact the site operator';
  end if;

  if v_offer.status not in ('selected', 'meetup_scheduled') then
    raise exception 'an offer can only be completed from selected or meetup_scheduled (current: %)', v_offer.status;
  end if;

  v_trade_number := v_settings.current_trade_number + 1;

  insert into public.trades (
    trade_number, source_offer_id, outgoing_item, incoming_item,
    outgoing_value, incoming_value,
    valuation_status, valuation_method, valuation_evidence,
    btc_amount, btc_usd_value, btc_valued_at, btc_valuation_source,
    btc_wallet_address, btc_transaction_id,
    public_story, public_participant_name, publicity_release_confirmed,
    general_location, completed_at, published, published_at,
    private_completion_notes
  ) values (
    v_trade_number,
    p_offer_id,
    btrim(p_outgoing_item),
    btrim(p_incoming_item),
    p_outgoing_value,
    p_incoming_value,
    case
      when p_valuation_evidence is not null and btrim(p_valuation_evidence) <> ''
        then 'verified'::public.valuation_status
      else 'estimated'::public.valuation_status
    end,
    btrim(p_valuation_method),
    nullif(btrim(p_valuation_evidence), ''),
    p_btc_amount,
    p_btc_usd_value,
    p_btc_valued_at,
    nullif(btrim(p_btc_valuation_source), ''),
    nullif(btrim(p_btc_wallet_address), ''),
    nullif(btrim(p_btc_transaction_id), ''),
    nullif(btrim(p_public_story), ''),
    nullif(btrim(p_public_participant_name), ''),
    coalesce(p_publicity_release_confirmed, false),
    btrim(p_general_location),
    p_completed_at,
    true,
    now(),
    nullif(btrim(p_private_completion_notes), '')
  )
  returning id into v_trade_id;

  -- Public images ----------------------------------------------------------
  if jsonb_typeof(p_media) <> 'array' then
    raise exception 'media must be a json array';
  end if;
  if jsonb_array_length(p_media) > 10 then
    raise exception 'at most 10 public images are allowed';
  end if;
  for v_entry in select * from jsonb_array_elements(p_media) loop
    if v_entry->>'storage_path' is null or btrim(v_entry->>'storage_path') = '' then
      raise exception 'media entry is missing storage_path';
    end if;
    insert into public.trade_media (trade_id, storage_path, alt_text, sort_order)
    values (
      v_trade_id,
      btrim(v_entry->>'storage_path'),
      nullif(btrim(coalesce(v_entry->>'alt_text', '')), ''),
      coalesce((v_entry->>'sort_order')::int, 0)
    );
  end loop;

  select tm.storage_path into v_first_media_path
  from public.trade_media tm
  where tm.trade_id = v_trade_id
  order by tm.sort_order asc
  limit 1;

  -- Homepage current item switches to the newly received asset. This is what
  -- makes the site data-driven: no code edits move a trade to the homepage.
  update public.challenge_settings set
    current_item_name = btrim(p_incoming_item),
    current_item_description = coalesce(
      nullif(btrim(p_incoming_item_description), ''),
      current_item_description
    ),
    current_item_value = p_incoming_value,
    current_item_image_path = v_first_media_path,
    current_item_general_location = btrim(p_general_location),
    current_trade_number = v_trade_number
  where id = 1;

  update public.offers
  set status = 'completed'::public.offer_status
  where id = p_offer_id;

  -- Draft broadcast (prompt 12 adds editing/preview/sending). Never auto-sent.
  insert into public.email_broadcasts (trade_id, subject, body_html, audience_type, status)
  values (
    v_trade_id,
    coalesce(nullif(btrim(p_draft_subject), ''), 'Trade #' || v_trade_number || ' published'),
    coalesce(nullif(btrim(p_draft_body_html), ''), '<p>A new trade was published.</p>'),
    'ongoing_followers',
    'draft'
  );

  return jsonb_build_object('trade_id', v_trade_id, 'trade_number', v_trade_number);
end;
$$;

revoke execute on function public.publish_trade from public;
grant execute on function public.publish_trade to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Safe edit of a published trade
-- ---------------------------------------------------------------------------
-- Single transaction, SECURITY INVOKER (every statement still passes RLS),
-- explicit is_admin() gate, EXECUTE restricted to authenticated. Media rows
-- are replaced wholesale only when p_media is provided; pass null to leave
-- the photo set untouched.

create or replace function public.update_published_trade(
  p_trade_id uuid,
  p_outgoing_item text,
  p_incoming_item text,
  p_outgoing_value numeric,
  p_incoming_value numeric,
  p_valuation_method text,
  p_valuation_evidence text,
  p_general_location text,
  p_public_story text,
  p_public_participant_name text,
  p_publicity_release_confirmed boolean,
  p_incoming_item_description text default null,
  p_media jsonb default null,
  p_confirm_value_change boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_trade public.trades%rowtype;
  v_settings public.challenge_settings%rowtype;
  v_entry jsonb;
  v_first_media_path text;
  v_value_changed boolean;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_trade
  from public.trades
  where id = p_trade_id
  for update;
  if not found then
    raise exception 'trade not found';
  end if;

  -- Required public fields (mirror publish_trade) --------------------------
  if p_outgoing_item is null or btrim(p_outgoing_item) = '' then
    raise exception 'the item given away is required';
  end if;
  if p_incoming_item is null or btrim(p_incoming_item) = '' then
    raise exception 'the item received is required';
  end if;
  if p_valuation_method is null or btrim(p_valuation_method) = '' then
    raise exception 'the valuation method is required';
  end if;
  if p_general_location is null or btrim(p_general_location) = '' then
    raise exception 'a public general location is required';
  end if;
  if p_outgoing_value is null or p_outgoing_value < 0 then
    raise exception 'the outgoing value must be zero or more';
  end if;
  if p_incoming_value is null or p_incoming_value < 0 then
    raise exception 'the incoming value must be zero or more';
  end if;

  -- Publicity consent (spec §32), re-checked on every edit.
  if p_public_participant_name is not null
     and btrim(p_public_participant_name) <> ''
     and not coalesce(p_publicity_release_confirmed, false) then
    raise exception 'publicity release confirmation is required when a participant name is published';
  end if;

  v_value_changed :=
    p_outgoing_value is distinct from v_trade.outgoing_value
    or p_incoming_value is distinct from v_trade.incoming_value;

  -- Prompt 27: historical values are the public record of the challenge.
  -- Changing them requires the caller's explicit confirmation flag.
  if v_value_changed and not coalesce(p_confirm_value_change, false) then
    raise exception 'changing historical values requires explicit confirmation';
  end if;

  -- BTC trades freeze the USD fair-market value as tax/recordkeeping data
  -- (spec §38). Value edits would silently desync the frozen FMV from the
  -- btc_* columns, so they are rejected here; text/photo fields stay
  -- editable.
  if v_value_changed and v_trade.btc_amount is not null then
    raise exception 'btc trades hold a frozen usd fair-market value; historical values cannot be edited here';
  end if;

  update public.trades set
    outgoing_item = btrim(p_outgoing_item),
    incoming_item = btrim(p_incoming_item),
    outgoing_value = p_outgoing_value,
    incoming_value = p_incoming_value,
    valuation_status = case
      when p_valuation_evidence is not null and btrim(p_valuation_evidence) <> ''
        then 'verified'::public.valuation_status
      else 'estimated'::public.valuation_status
    end,
    valuation_method = btrim(p_valuation_method),
    valuation_evidence = nullif(btrim(p_valuation_evidence), ''),
    public_story = nullif(btrim(p_public_story), ''),
    public_participant_name = nullif(btrim(p_public_participant_name), ''),
    publicity_release_confirmed = coalesce(p_publicity_release_confirmed, false),
    general_location = btrim(p_general_location)
  where id = p_trade_id;

  -- Public images: replace the whole set when provided ---------------------
  if p_media is not null then
    if jsonb_typeof(p_media) <> 'array' then
      raise exception 'media must be a json array';
    end if;
    if jsonb_array_length(p_media) > 10 then
      raise exception 'at most 10 public images are allowed';
    end if;
    delete from public.trade_media where trade_id = p_trade_id;
    for v_entry in select * from jsonb_array_elements(p_media) loop
      if v_entry->>'storage_path' is null or btrim(v_entry->>'storage_path') = '' then
        raise exception 'media entry is missing storage_path';
      end if;
      insert into public.trade_media (trade_id, storage_path, alt_text, sort_order)
      values (
        p_trade_id,
        btrim(v_entry->>'storage_path'),
        nullif(btrim(coalesce(v_entry->>'alt_text', '')), ''),
        coalesce((v_entry->>'sort_order')::int, 0)
      );
    end loop;
  end if;

  -- Homepage sync: when the corrected trade IS the current item, keep the
  -- settings row consistent in the same transaction (mirror publish_trade).
  select * into v_settings
  from public.challenge_settings
  where id = 1
  for update;
  if not found then
    raise exception 'challenge settings row is missing';
  end if;
  if v_settings.current_trade_number = v_trade.trade_number then
    select tm.storage_path into v_first_media_path
    from public.trade_media tm
    where tm.trade_id = p_trade_id
    order by tm.sort_order asc
    limit 1;
    update public.challenge_settings set
      current_item_name = btrim(p_incoming_item),
      current_item_description = coalesce(
        nullif(btrim(p_incoming_item_description), ''),
        current_item_description
      ),
      current_item_value = p_incoming_value,
      current_item_image_path = v_first_media_path,
      current_item_general_location = btrim(p_general_location)
    where id = 1;
  end if;

  return jsonb_build_object(
    'trade_id', p_trade_id,
    'trade_number', v_trade.trade_number,
    'value_changed', v_value_changed,
    'current_item_synced', v_settings.current_trade_number = v_trade.trade_number
  );
end;
$$;

revoke execute on function public.update_published_trade from public;
grant execute on function public.update_published_trade to authenticated;

-- ---------------------------------------------------------------------------
-- 3. No normal hard deletes
-- ---------------------------------------------------------------------------
-- Prompt 27: offers, followers and trades are never hard-deleted in normal
-- operation — statuses are terminal states, unsubscribes are timestamp
-- updates, and published trades are corrected through
-- update_published_trade. Removing the DELETE capability from the app role
-- enforces that at the database layer: no UI path, no hand-rolled query
-- with the anon-key client can remove these records. The broadcast
-- recipient send-log is locked down for the same reason — deleting sent
-- entries would let already-delivered addresses be re-emailed on retry.
--
-- trade_media deliberately keeps DELETE: replacing a published trade's
-- photo set rewrites media rows. Service-role emergency access is
-- unchanged.

drop policy admin_delete on public.offers;
drop policy admin_delete on public.followers;
drop policy admin_delete on public.trades;
drop policy admin_delete on public.email_broadcast_recipients;

revoke delete on public.offers from authenticated;
revoke delete on public.followers from authenticated;
revoke delete on public.trades from authenticated;
revoke delete on public.email_broadcast_recipients from authenticated;
