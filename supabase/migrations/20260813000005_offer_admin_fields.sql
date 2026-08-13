-- ONE → FIVE — PROMPT 10 / build spec §6.3
-- Migration 5: private admin review columns on offers.
--
-- The base schema (migration 1) already carries internal_notes and
-- verification_method; §6.3 additionally requires authenticity/ownership
-- status, risk flags, and contact history notes. All three are private:
-- offers is RLS-locked to admins (is_admin()), so these inherit protection
-- automatically and never appear in any public view.

alter table public.offers
  add column if not exists authenticity_notes text,
  add column if not exists risk_flags text,
  add column if not exists contact_notes text;
