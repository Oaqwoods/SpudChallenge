-- ONE → FIVE — PROMPT 19
-- Migration 9: safe seed process for the initial challenge state.
--
-- Guarantees the single challenge_settings row exists with the canonical
-- prelaunch state, even on a project where the migration-4 seed was removed.
-- Safety properties:
--   * idempotent — on conflict it does nothing, so re-running is harmless;
--   * never overwrites an existing row — everything on the row becomes
--     admin-owned state the moment the challenge is customized/started;
--   * never touches start_at/end_at — challenge dates stay NULL and are
--     configured exclusively through the admin (playbook PROMPT 32).
--
-- The initial current item has no photo yet: current_item_image_path stays
-- NULL and the frontend serves the repo placeholder
-- (public/images/current-item-placeholder.png) until the admin publishes a
-- real image (publish_trade sets the path from the trade's first photo).

insert into public.challenge_settings (
  id,
  title,
  subtitle,
  starting_value,
  target_value,
  status,
  current_item_name,
  current_item_description,
  current_item_value,
  current_trade_number
) values (
  1,
  'ONE → FIVE',
  '$1 → $5,000,000 in 21 Days',
  1,
  5000000,
  'prelaunch',
  'One U.S. Dollar',
  'A single U.S. dollar — where the challenge begins.',
  1,
  0
)
on conflict (id) do nothing;

-- Verify the seed landed and report the effective initial state.
do $$
declare
  v public.challenge_settings;
begin
  select * into v from public.challenge_settings where id = 1;
  if not found then
    raise exception 'challenge seed failed: challenge_settings row id=1 is missing';
  end if;
  if v.start_at is not null or v.end_at is not null then
    raise notice 'challenge dates already configured (admin-owned): start_at=% end_at=%',
      v.start_at, v.end_at;
  else
    raise notice 'challenge dates are NULL — configure them via the admin, never hardcoded';
  end if;
  raise notice 'challenge seed verified: % / % / status=% / current item=% ($%) / trade #%',
    v.title, v.subtitle, v.status, v.current_item_name,
    v.current_item_value, v.current_trade_number;
end;
$$;
