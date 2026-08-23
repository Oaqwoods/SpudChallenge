-- ONE → FIVE — PROMPT 25 / build spec §25
-- Migration 10: backend enforcement of the offer state machine.
--
-- The UI only ever offers transitions the matrix allows, but the real
-- enforcement lives here: any status UPDATE that falls outside the allowed
-- pairs is rejected, no matter which client issued it. This is what keeps a
-- fast-moving admin (or a future bug) from skipping a brand-new offer
-- straight into the trade workflow, or from resurrecting a completed trade.
--
-- Matrix (spec §25, plus deliberate re-open exits):
--   new              -> reviewing, shortlisted, selected, declined, invalid
--   reviewing        -> shortlisted, selected, declined, invalid
--   shortlisted      -> selected, meetup_scheduled, declined, invalid
--   selected         -> meetup_scheduled, did_not_complete, declined, invalid,
--                       completed (publish_trade only)
--   meetup_scheduled -> did_not_complete, declined, invalid,
--                       completed (publish_trade only)
--   declined         -> reviewing (re-open is a deliberate admin decision)
--   did_not_complete -> reviewing (re-open after a walk-away)
--   invalid          -> (terminal)
--   completed        -> (terminal)
--
-- did_not_complete only touches the offers row, so the public current
-- item/value/trade count are unchanged by construction.

create or replace function public.enforce_offer_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = old.status then
    -- no-op updates (e.g. re-saving private notes alongside status) pass
    if new.status = 'meetup_scheduled'::public.offer_status
       and new.meetup_scheduled_at is null then
      new.meetup_scheduled_at := now();
    end if;
    return new;
  end if;

  if (old.status::text, new.status::text) in (
    ('new', 'reviewing'),
    ('new', 'shortlisted'),
    ('new', 'selected'),
    ('new', 'declined'),
    ('new', 'invalid'),
    ('reviewing', 'shortlisted'),
    ('reviewing', 'selected'),
    ('reviewing', 'declined'),
    ('reviewing', 'invalid'),
    ('shortlisted', 'selected'),
    ('shortlisted', 'meetup_scheduled'),
    ('shortlisted', 'declined'),
    ('shortlisted', 'invalid'),
    ('selected', 'meetup_scheduled'),
    ('selected', 'did_not_complete'),
    ('selected', 'declined'),
    ('selected', 'invalid'),
    ('selected', 'completed'),
    ('meetup_scheduled', 'did_not_complete'),
    ('meetup_scheduled', 'declined'),
    ('meetup_scheduled', 'invalid'),
    ('meetup_scheduled', 'completed'),
    ('declined', 'reviewing'),
    ('did_not_complete', 'reviewing')
  ) then
    -- Scheduling a meetup always records when it was scheduled; the UI may
    -- set the timestamp explicitly, otherwise the backend stamps it.
    if new.status = 'meetup_scheduled'::public.offer_status
       and new.meetup_scheduled_at is null then
      new.meetup_scheduled_at := now();
    end if;
    return new;
  end if;

  raise exception 'illegal offer status transition: % -> %', old.status, new.status
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists offer_status_transition_guard on public.offers;
create trigger offer_status_transition_guard
before update of status on public.offers
for each row
execute function public.enforce_offer_transition();
