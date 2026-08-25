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
3. **Meetup & verify** — schedule the meetup from the offer detail
   (`meetup_scheduled`) and record the **general area only** — the exact
   location stays private. Verify the item in person, then record verified
   value + method on the offer detail. Use **Mark contacted** after any
   call/email so the trail shows when you last reached the offerer.
4. **Complete the trade** — from the offer detail: Complete Trade → fill
   the new item, photos, story, publicity consent → preview → publish.
   Publishing updates the public item instantly and creates a **draft**
   broadcast email (never auto-sent).
   - **Walk-away:** if either party backs out before the actual transfer,
     use **Did Not Complete** and record the reason. Nothing public changes
     (item, value and trade count stay put) and the other shortlisted
     offers remain available to select.
   - **Paperwork:** after the transfer, attach the signed receipt/agreement
     or any professional verification under **Admin → Trades → Edit →
     Private verification documents** (private bucket, never published —
     keep these, they are the valuation/tax recordkeeping trail).
5. **Send the trade email** — `/admin/emails/`, preview the draft, then
   send with the two-step confirmation. Only opted-in, non-unsubscribed
   followers receive it; retries never double-send.
6. **Glance at the site** — current item panel, journey card, and
   scoreboard reflect the new trade.
7. **Follower wall** — `/admin/followers/` shows group counts (ongoing
   email followers / trade-interest leads / both) and lets you hide or
   re-show any public wall entry. Unsubscribes leave the wall
   automatically; nothing here sends email.

## If something needs a pause

- Urgent break (safety, dispute, travel): open **Admin → Launch controls →
  Pauses & public notice**. Check **Pause new trade offers** and/or **Pause
  follower signups**, optionally add a public notice (shown in the homepage
  hero), and save. Both forms show the paused state immediately and the
  server rejects new submissions; uncheck and save to resume. The clock
  keeps running — pauses never extend time.

## Day 21 — completion

1. The phase flips to complete automatically when `end_at` passes (or set
   status `complete` in Launch controls to end early). New offers are
   rejected server-side from the moment `end_at` passes; if a meetup
   finishes right at the deadline you can still publish that final trade
   until you end the challenge explicitly.
2. Final stats render automatically: final value, multiplier, trade count,
   goal verdict. The offer form closes itself; follower signups stay open
   unless you pause them in Launch controls.
3. When every trade is published, set the stored status to `complete` in
   Launch controls — this **freezes the trade order**: new publishes are
   rejected (corrections via Trades → Edit still work), and the archive
   stays available in the admin.
4. Send a final wrap-up broadcast from `/admin/emails/` if you want one.
5. Legal/recordkeeping: export the records with the built-in admin CSV
   buttons — **Export offers CSV** on the dashboard, **Export followers CSV**
   on the Followers page, **Export trades CSV** on the Trades page. Each
   downloads a dated `.csv` (private columns included — contact data, admin
   notes, BTC verification fields) generated entirely in your browser; store
   the files somewhere safe.
6. Attorney review of Terms/Privacy placeholders before relying on them.

## Optional: turn on CAPTCHA (off by default)

Signups, offers, and offer-photo uploads absorb bots through honeypots,
rate limits and body caps. If you still see automated spam, enable the
built-in CAPTCHA integration point:

1. Pick a provider (Cloudflare Turnstile or hCaptcha), create a site key +
   secret for `spudchallenge.online`.
2. `supabase secrets set CAPTCHA_PROVIDER=turnstile CAPTCHA_SECRET=<secret>`
   (or `CAPTCHA_PROVIDER=hcaptcha`), then redeploy the three functions
   `follow-signup`, `offer-upload`, `submit-offer`.
3. Add the provider's widget to the public forms and pass the widget token
   as `captcha_token` in the existing submission payloads.

Until step 3 ships, a configured CAPTCHA blocks all submissions
(fail-closed) — so configure the widget first. Unset both secrets to
disable. Unsubscribe links never need a CAPTCHA.

## Emergency contacts & rollbacks

- Lost admin password: `/admin/login/` → **Forgot your password?** → enter
  the admin email → open the emailed link (lands on
  `/admin/reset-password/`) → set a new password (at least 8 characters) →
  sign in at `/admin/login/`. If the link reports invalid/expired, request
  a fresh one. Requires the redirect URL described in `supabase/README.md`
  → Password recovery.
- Broken deploy: Actions → rerun the last good workflow, or push a revert
  commit. Static hosting means the previous build is never lost.
- Bad publish: open **Admin → Trades → Edit** on the published trade and
  correct the typo/photo/story there. Saving a historical **value** change
  requires checking an explicit confirmation box first, BTC trades keep
  their frozen USD fair-market value locked, and editing the latest trade
  re-syncs the homepage current item automatically. Published trades are
  never hard-deleted — row deletion on offers/followers/trades is disabled
  at the database level.
- Email problems: check Edge Function logs in Supabase → Logs; the
  broadcast screen shows per-recipient send failures and supports retry.
