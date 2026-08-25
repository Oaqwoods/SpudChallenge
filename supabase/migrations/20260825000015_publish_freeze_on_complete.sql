-- ONE → FIVE — PROMPT 30 / pause, archive, attribution
-- Migration 15: freeze the trade order at completion.
--
-- Publishing a new trade after the challenge is complete would rewrite the
-- public journey, scoreboard and homepage. Once the stored challenge status
-- is 'complete' (Launch controls, or the admin flipping it after the clock
-- runs out), publish_trade refuses to create another trade. The idempotent
-- replay path still returns an already-published trade, and the safe-edit
-- RPC (migration 12) remains available for corrections.
--
-- The clock alone does not freeze publishing on purpose: the final trade's
-- meetup may legitimately complete right at the deadline, and the stored
-- status stays 'active' until the admin ends the challenge. Offers, in
-- contrast, close the moment end_at passes (offer-validation challengeEnded).
--
-- Full re-issue of migration 12's body; the only behavioral addition is the
-- completion guard after the offer status check.

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

  -- Prompt 30: at completion the trade order is frozen. Corrections to an
  -- existing trade still go through update_published_trade.
  if v_settings.status = 'complete' then
    raise exception 'the challenge is complete — the trade order is frozen (edit existing trades instead)';
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
