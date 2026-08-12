-- ONE → FIVE — PROMPT 2 / build spec §8.7
-- Migration 4 of 4: seed the single challenge_settings row (prelaunch).
-- PROMPT 19 refines the full initial-challenge seed; no personal data here.

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
