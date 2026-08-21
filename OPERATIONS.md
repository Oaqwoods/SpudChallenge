# Operations Checklist — ONE → FIVE

Simple day-by-day runbook for the challenge owner. The site is static and
admin-configured: nothing here requires a code deploy except the Edge
Function items marked **[deploy]**.

## Pending before launch (status as of 2026-08-21)

- [ ] **[deploy]** Deploy the two missing Edge Functions (`track-event`,
      `send-broadcast` — both currently return 404). From the repo:
      `supabase functions deploy track-event` and
      `supabase functions deploy send-broadcast` (see `supabase/README.md`).
      Analytics and trade-completion emails depend on them.
- [ ] Wait for the HTTPS certificate on `spudchallenge.online` (issued by
      GitHub, can take up to 24 h after DNS). When ready, enable **Enforce
      HTTPS** in repo → Settings → Pages.
- [ ] Confirm the Resend sending domain is verified and `RESEND_API_KEY` is
      set on all Edge Functions (signup confirmation emails depend on it).
- [ ] Confirm your user is in `app_admins` and you can sign in at
      `/admin/login/`.
- [ ] Smoke test with your own email: sign up on the homepage → check your
      inbox for the confirmation email → click the unsubscribe link once to
      prove it works → sign up again if you want updates.

## Day 0 — launch

1. Upload the real $1 photo to the `trade-media` bucket and set
   `current_item_image_path` on the settings row (or swap
   `public/images/current-item-placeholder.png`).
2. Open **Admin → Launch controls** (`/admin/settings/`).
3. Press **START CHALLENGE NOW** (confirm the checkbox). This sets status
   `active`, `start_at` to now, `end_at` to +21 days. It cannot be
   repeated; corrections happen through the schedule fields.
4. Reload the homepage: countdown should switch to "Time Remaining", the
   offer CTA should become active.

## Days 1–21 — daily routine (~15 min + meetup time)

1. **Check offers** — Admin dashboard: new offers appear with a badge
   count. Review photos (signed URLs expire after 15 min — click again if
   blank), claimed value, and comp URL.
2. **Move good offers** — `reviewing` → `shortlisted` → `selected`.
   Declines never notify the offerer automatically; send any personal
   follow-up yourself.
3. **Meetup & verify** — schedule the meetup (`meetup_scheduled`), verify
   the item in person, record verified value + method on the offer detail.
4. **Complete the trade** — from the offer detail: Complete Trade → fill
   the new item, photos, story, publicity consent → preview → publish.
   Publishing updates the public item instantly and creates a **draft**
   broadcast email (never auto-sent).
5. **Send the trade email** — `/admin/emails/`, preview the draft, then
   send with the two-step confirmation. Only opted-in, non-unsubscribed
   followers receive it; retries never double-send.
6. **Glance at the site** — current item panel, journey card, and
   scoreboard reflect the new trade.

## If something needs a pause

- Urgent break (safety, dispute, travel): set `offers_paused` and/or
  `follower_signups_paused` in the DB and optionally `public_notice`
  (shown in the hero). The clock keeps running — pauses never extend time.
  Admin pause buttons are planned (playbook prompt 30); until then use the
  SQL editor.

## Day 21 — completion

1. The phase flips to complete automatically when `end_at` passes (or set
   status `complete` in Launch controls to end early).
2. Final stats render automatically: final value, multiplier, trade count,
   goal verdict. Offer and follower forms close themselves.
3. Send a final wrap-up broadcast from `/admin/emails/` if you want one.
4. Legal/recordkeeping: export or archive offers, followers, and trades
   (CSV tooling is a post-Day-21 item — Supabase Studio exports work).
5. Attorney review of Terms/Privacy placeholders before relying on them.

## Emergency contacts & rollbacks

- Broken deploy: Actions → rerun the last good workflow, or push a revert
  commit. Static hosting means the previous build is never lost.
- Bad publish: correct the trade via the DB (a safe admin edit screen is
  planned, playbook prompt 27) — published trades are never hard-deleted.
- Email problems: check Edge Function logs in Supabase → Logs; the
  broadcast screen shows per-recipient send failures and supports retry.
