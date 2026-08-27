-- ONE → FIVE — PROMPT 39 follow-up / build spec §17A
-- Migration 18: prelaunch spam exception.
--
-- Migration 17 froze every offer status change while the challenge is
-- prelaunch (collected only). Owner decision: obviously spam/invalid
-- submissions still need triage before launch, so the freeze gains exactly
-- one exception — `new -> invalid`. Nothing else moves before START
-- CHALLENGE NOW: no reviewing, shortlisting, selecting, declining,
-- completing. `invalid` remains terminal, so a prelaunch spam exit can
-- never re-enter the trade workflow.
--
-- Re-issues enforce_offer_transition() (same pattern as migrations 15/16);
-- migration 17 stays applied as-is.

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

  -- Prompt 39: prelaunch submissions are collected only. Until the admin
  -- deliberately starts the challenge, offers are frozen at their current
  -- status — collecting an offer never starts the clock and never amounts
  -- to selecting or agreeing to a trade. The one exception: spam triage
  -- (new -> invalid) stays available before launch.
  if exists (
    select 1 from public.challenge_settings where id = 1 and status = 'prelaunch'
  ) and not (
    old.status = 'new' and new.status = 'invalid'
  ) then
    raise exception
      'prelaunch offers are collected only — no status changes until the challenge has started'
      using errcode = 'check_violation';
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
