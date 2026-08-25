# Security — ONE → FIVE

Scope: focused MVP security review (playbook prompt 15). The goal is a
defensible small-audience deployment, not enterprise hardening. Last review:
2026-08-20; prompt-27 admin-safety and prompt-28 volume/upload-hardening
follow-ups 2026-08-25.

## Protections implemented

### Data access

- **RLS on every table.** All challenge tables (`followers`, `offers`,
  `offer_files`, `trades`, `trade_media`, `trade_documents`,
  `challenge_settings`, `email_broadcasts`, `email_broadcast_recipients`,
  `analytics_events`) have row-level security enabled with admin-only
  policies (`public.is_admin()` checks `app_admins`). There are **no public
  INSERT/UPDATE policies** — anonymous visitors can only read the approved
  public views.
- **Public views expose only approved columns.** `public_trades`,
  `public_trade_media`, `public_challenge_settings`, `public_follower_wall`
  and `public_follower_count` deliberately omit private columns (contact
  data, valuation evidence, BTC wallet/transaction ids, admin flags,
  private notes).
- **Public submissions go through Edge Functions** using the service role —
  the service key lives only in Edge Function environment variables and is
  never bundled for the browser (enforced by convention + a test that fails
  if admin code references it).
- **Admin sign-in** requires Supabase Auth **and** membership in
  `app_admins`; the edge function `send-broadcast` re-verifies the session
  JWT server-side before sending anything. Non-admin sessions are signed out
  immediately after login attempts.
- **Admin password recovery** is self-service from the admin sign-in page
  (**Forgot your password?**), which calls `resetPasswordForEmail` with the
  anon key and an allowlisted `redirectTo`
  (`https://spudchallenge.online/admin/reset-password`); Supabase
  rate-limits requests and never reveals whether the address exists. The
  public `/admin/reset-password/` page only works with the Supabase recovery
  session created when the emailed recovery link is clicked; invalid or
  expired links show an explanatory message instead of a form. The update
  uses `supabase.auth.updateUser` with the anon-key browser client — no
  service-role key is involved, and neither `app_admins` membership nor the
  user's UUID changes. New passwords must be at least 8 characters and
  match in both fields. The page is excluded from search indexes by the
  admin layout's robots metadata.
- **No hard deletes of business records (prompt 27).** `DELETE` on `offers`,
  `followers`, `trades` and `email_broadcast_recipients` is **revoked from
  the `authenticated` role** and the matching `admin_delete` RLS policies are
  dropped (`20260825000012_trade_safety.sql`). Even a fully signed-in admin
  using the anon-key browser client cannot delete these rows — records are
  archived by status/timestamp or corrected, never removed. `trade_media`
  keeps DELETE because replacing a trade's photo set rewrites media rows, and
  service-role (dashboard) emergency access is unchanged.
- **Published-trade corrections go through one transactional RPC.**
  `update_published_trade(...)` is `SECURITY INVOKER` with an explicit
  `is_admin()` gate and `EXECUTE` granted to `authenticated` only. It locks
  the trade row, re-checks publicity consent, rejects any historical-value
  change unless the caller passes an explicit confirmation flag, refuses to
  touch the frozen USD fair-market value on BTC trades, and re-syncs the
  homepage `challenge_settings` row in the same transaction when the
  corrected trade is the current item. There is no browser-side write
  sequence to a published trade.
- **Idempotent publish.** A retried or double `publish_trade` call cannot
  create a second trade or report failure: once the source offer is
  `completed`, the RPC returns the existing trade for that offer.

### Input handling

- **No `dangerouslySetInnerHTML` anywhere.** All user content renders
  through React's escaping. The broadcast preview renders admin-edited HTML
  in an iframe with `sandbox=""` (no scripts, no forms, no navigation).
- **Server-side validation on every public write:** email format, length
  caps via `sanitizeText` (control characters stripped, truncated), value
  caps, and honeypot fields that silently absorb bots.
- **Upload abuse controls:** image MIME allowlist only (jpeg/png/webp),
  server-generated storage paths (no client-controlled names, so no path
  traversal), HMAC submit tokens binding each issued path to the eventual
  submission, and existence verification before an offer references a
  photo. Signed photo URLs for admins expire in 15 minutes.
- **File-size caps enforced twice (prompt 28):** the 10 MB limit is checked
  at upload-URL issuance against the declared size AND at the bucket level —
  migration `20260825000013` sets Supabase Storage `file_size_limit` to
  10 MB on `offer-uploads` and `trade-media`, so a dishonest client cannot
  push a larger object through a signed URL.
- **Max 5 item photos per offer,** enforced server-side at submission
  (`MAX_PHOTOS`) and in the form; anonymous uploads accept images only —
  identity/title/proof-of-ownership documents are never collected.
- **Payload size caps** on all public endpoints (65 KB on the large forms,
  16 KB on small ones, including upload-URL issuance).
- **Authoritative server state:** offer submissions snapshot the current
  item server-side and reject stale submissions rather than trusting
  browser-supplied challenge state.

### Abuse controls

- **Rate limiting per IP** on every public Edge Function
  (signups 10/10 min, offers 5/10 min, uploads 20/10 min, unsubscribe
  20/10 min, analytics 300/10 min).
- **CORS allowlist** with exact production/preview/localhost origins only;
  unknown origins never get a reflected `Access-Control-Allow-Origin` and
  receive 403. No wildcards.
- **No cookie auth anywhere** — all authenticated calls use explicit
  `Authorization: Bearer` headers, so classic CSRF does not apply.
- **Anti-enumeration:** follow signup returns identical responses for new
  and existing addresses; unsubscribe treats unknown addresses as success.
- **Tokens:** HMAC tokens are compared in constant time.
- **Optional CAPTCHA integration point, disabled by default (prompt 28).**
  follow-signup, offer-upload and submit-offer verify a `captcha_token`
  field only when `CAPTCHA_PROVIDER` (turnstile/hcaptcha) and
  `CAPTCHA_SECRET` are set on the Edge Functions; otherwise the check is a
  no-op and behavior is unchanged. Verification is fail-closed (an
  unreachable provider rejects), provider responses are never logged, and
  the HMAC-token-authenticated unsubscribe flow is exempt so emailed links
  keep working.

### Privacy

- Analytics stores only allowlisted event names, pathnames, UTMs and a
  coarse detail string — never emails, phone numbers, offer text or files.
  The allowlist is enforced by both a Postgres check constraint and the
  Edge Function.
- **Error logs are sanitized (prompt 28):** every Edge Function catch block
  logs `errorMessage(err)` (`_shared/logging.ts`) — the short message text
  only. Raw error objects are never logged because PostgREST `details` can
  carry user data (e.g. a duplicate-key DETAIL contains the conflicting
  email), and no client/component code logs to the console at all.
- **Admin CSV exports stay in the admin session (prompt 27).** The offers,
  followers/preferences and trades exports are generated entirely in the
  signed-in admin's browser from rows RLS already authorizes that session to
  read; no file is uploaded anywhere and no new server-side surface is
  created. They intentionally include private recordkeeping columns (contact
  data, admin notes, BTC verification fields) because they are the
  operator's own compliance/backup records.

## Known limitations

- **Admin routes are gated client-side** (spec §9 accepts this for V1).
  The real protection is RLS + server-side JWT checks; the gate hides the
  UI, it is not an auth boundary.
- **Unsubscribe tokens are stateless and do not expire.** A leaked
  unsubscribe link works indefinitely — but it can only unsubscribe that
  one address, which is reversible by re-subscribing.
- **Rate-limit keys derive from `x-forwarded-for`.** This assumes the
  Supabase edge delivers the real client IP; a platform change would
  weaken rate limiting.
- **Upload storage is bounded but not zero-cost:** 20 uploads × 10 MB per
  IP per 10 minutes. Cleanup of orphaned draft uploads is manual (the
  offer-upload draft directories).
- **Broadcast `body_html` is admin-authored and sent as-is.** The trust
  boundary is the admin account itself; a compromised admin account could
  send crafted email.
- **`app_admins` is readable by any authenticated Supabase user** (UUIDs
  only — no emails). Required so RLS policies can evaluate; knowing an
  admin UUID grants nothing.
- **CSV exports are plaintext once downloaded.** They contain contact data
  and private notes; protection of the resulting file (disk encryption,
  access control, timely deletion) is an operator responsibility.
- **GitHub Pages serves a static site** — no server-side security headers
  (CSP etc.) are configurable beyond the platform defaults.

## Operational precautions

- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `PREFERENCE_TOKEN_SECRET`,
  `RESEND_API_KEY`) live only in Supabase Edge Function secrets — never in
  `.env` files committed to the repo, never in `NEXT_PUBLIC_*` variables.
  Rotate all three if any is suspected leaked; also rotate
  `PREFERENCE_TOKEN_SECRET` after a leak of unsubscribe links is suspected
  (it invalidates all outstanding unsubscribe links).
- Admin accounts are created privately via the Supabase dashboard and added
  to `app_admins` manually. Use MFA on those Supabase accounts.
- Review Supabase auth logs and `analytics_events` periodically for
  anomalies (offer/follower spikes from single IPs).
- Periodically delete orphaned `offer-drafts/*` storage objects for offers
  that never submitted.
- Treat downloaded CSV exports as sensitive records: keep them on an
  encrypted device, restrict access, and delete copies that are no longer
  needed.
