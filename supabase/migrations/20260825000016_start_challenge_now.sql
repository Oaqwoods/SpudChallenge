-- ONE → FIVE — PROMPT 32 / START CHALLENGE NOW
-- Migration 16: authoritative, confirmation-gated challenge start.
--
-- Until now the admin's browser computed start_at/end_at
-- (computeLaunchWindow(Date.now())) and sent them in a plain UPDATE. That
-- put the 21-day duration on the admin's clock and made the double-start
-- guard client-side only. This RPC moves the whole transition server-side:
--
--   * start_at is the backend's now(), never the browser clock
--   * end_at is exactly start_at + 21 days (single transaction timestamp,
--     so the window is exact regardless of DST or clock drift)
--   * status flips prelaunch → active
--   * repeated/duplicate starts are rejected atomically: the settings row
--     is locked FOR UPDATE and the guard re-checks status + start_at
--     inside the transaction, so racing or repeated calls cannot start it
--     twice
--
-- SECURITY INVOKER with an explicit is_admin() gate (mirrors publish_trade);
-- EXECUTE restricted to authenticated. Manual future scheduling remains the
-- admin settings form (schedule fields + stored status), unchanged.

create or replace function public.start_challenge_now()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_settings public.challenge_settings%rowtype;
  v_now timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select * into v_settings
  from public.challenge_settings
  where id = 1
  for update;
  if not found then
    raise exception 'challenge settings row is missing';
  end if;

  -- Double-start guard, enforced server-side: the challenge must still be
  -- prelaunch and never started.
  if v_settings.status <> 'prelaunch' then
    raise exception 'the challenge has already been started (status: %)', v_settings.status;
  end if;
  if v_settings.start_at is not null then
    raise exception 'the challenge has already been started (start date already set)';
  end if;

  -- One transaction timestamp for the whole window: end_at is EXACTLY
  -- 21 days after start_at, stamped by the database clock.
  v_now := now();

  update public.challenge_settings set
    status = 'active',
    start_at = v_now,
    end_at = v_now + interval '21 days'
  where id = 1;

  return jsonb_build_object(
    'status', 'active',
    'start_at', v_now,
    'end_at', v_now + interval '21 days'
  );
end;
$$;

revoke execute on function public.start_challenge_now from public;
grant execute on function public.start_challenge_now to authenticated;
