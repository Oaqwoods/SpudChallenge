-- ONE → FIVE — PROMPT 39 / build spec §17A
-- Migration 17: prelaunch offer freeze.
--
-- Prelaunch Trade #1 offers are COLLECTED ONLY. They may be stored and
-- reviewed, but no offer may change status while the challenge is still
-- prelaunch — no selecting, shortlisting, declining, completing. Every
-- collected offer unlocks into the normal review → shortlist → selected →
-- meetup → completed → published workflow the moment START CHALLENGE NOW
-- flips status to active (migration 16 stamps start_at with the database
-- clock, so created_at < start_at reliably identifies prelaunch offers).
--
-- This extends the existing transition trigger (migration 10) rather than
-- adding a second state machine: the prelaunch freeze is checked first,
-- then the unchanged prompt-25 matrix applies. The no-op pass (status
-- unchanged, e.g. saving private notes) is preserved so admin note-taking
-- keeps working before launch.

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
  -- to selecting or agreeing to a trade.
  if exists (
    select 1 from public.challenge_settings where id = 1 and status = 'prelaunch'
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
