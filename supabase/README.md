# Supabase foundation

Migrations in `migrations/` implement the PROMPT 2 foundation from the build
spec (§8 schema, §9 security, §24 public data architecture, §38 Bitcoin
exception).

| File | Contents |
| --- | --- |
| `20260812000001_schema.sql` | Enums, 9 tables, constraints, indexes, `updated_at` trigger |
| `20260812000002_rls_and_views.sql` | `is_admin()`, RLS + admin policies, public-safe views |
| `20260812000003_storage.sql` | `offer-uploads` (private) and `trade-media` (public) buckets + storage policies |
| `20260812000004_seed.sql` | Single `challenge_settings` row (prelaunch, $1 start, $5M target) |
| `20260813000005_offer_admin_fields.sql` | Private admin review columns on `offers` (authenticity notes, risk flags, contact notes; playbook PROMPT 10 / spec §6.3) |
| `20260813000006_publish_trade.sql` | `trades.private_completion_notes` + transactional `publish_trade(...)` RPC (all-or-nothing publish, Bitcoin exception validation, draft broadcast; playbook PROMPT 11 / spec §6.5, §38) |
| `20260820000007_broadcast_recipients.sql` | `email_broadcast_recipients` per-recipient send log for broadcasts (status/errors, safe retry, audit; playbook PROMPT 12 / spec §7.3) |
| `20260820000008_analytics_events.sql` | `analytics_events` privacy-light telemetry table (event allowlist constraint, admin-read RLS; playbook PROMPT 14 / spec §13) |
| `20260821000009_seed_initial_challenge.sql` | PROMPT 19 safe seed guard: inserts the canonical prelaunch row if missing, never overwrites an existing admin-owned row, leaves `start_at`/`end_at` NULL and verifies the effective initial state |
| `20260823000010_offer_transition_guard.sql` | Offer state-machine trigger: rejects any status UPDATE outside the allowed transition matrix, stamps `meetup_scheduled_at` when a meetup is scheduled (playbook PROMPT 25 / spec §25) |

## Applying the migrations

**Option A — Supabase CLI** (recommended):

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

**Option B — Dashboard SQL Editor:** paste and run the ten files in
timestamp order, one at a time.

## Access model (RLS)

- `anon` → nothing on tables; `SELECT` on the public-safe views only
  (`public_trades`, `public_trade_media`, `public_challenge_settings`,
  `public_follower_wall`, `public_follower_count`).
- `authenticated` non-admin → denied on everything.
- `authenticated` admin (uuid listed in `app_admins`) → full access.
- `service_role` → bypasses RLS; used only inside Supabase Edge Functions.
- There are no public INSERT policies: offers and email preferences are
  written by Edge Functions with the service role.

## Admin bootstrap (playbook PROMPT 8)

The admin area lives at `/admin/` and signs in at `/admin/login/` using
Supabase Auth (email + password). `app_admins` is intentionally empty; the
admin user is provisioned by hand, once:

1. **Create the auth user** — Supabase dashboard → *Authentication → Users →
   Add user*. Use the operator's email and a strong password, and confirm the
   user immediately. Copy the user's UUID.
2. **Register the admin** — SQL editor (or service role):

   ```sql
   insert into public.app_admins (user_id) values ('<admin auth user uuid>');
   ```

3. **Close public signups** — *Authentication → Sign In / Up → Sign ups*:
   turn **off**. V1 has exactly one admin; there is no public registration.

### Password recovery

If the admin password is lost, request a reset link from the app itself:

1. On `/admin/login/`, choose **Forgot your password?**, enter the admin
   email and send. The app calls `supabase.auth.resetPasswordForEmail` with
   the anon key and an explicit `redirectTo` of
   `https://spudchallenge.online/admin/reset-password`; Supabase
   rate-limits the request and never reveals whether the address exists.
2. The emailed link lands on `/admin/reset-password/`, where the admin sets
   a new password (project requirement: at least 8 characters, both fields
   must match). The page only works with the recovery session created by the
   link; invalid/expired links show a message instead of a blank page.
3. The update calls `supabase.auth.updateUser` with the anon-key browser
   client — no service-role key is involved, and neither `app_admins`
   membership nor the user's UUID changes. After the update the admin signs
   in at `/admin/login/` with the new password.

Required URL configuration (dashboard → *Authentication → URL
Configuration*):

- **Site URL** stays `https://spudchallenge.online` — recovery does not rely
  on it because the app passes an explicit `redirectTo`.
- **Redirect URLs**: add
  `https://spudchallenge.online/admin/reset-password` — the exact value used
  as `redirectTo` (no trailing slash) — plus
  `http://localhost:3000/admin/reset-password` for local testing.

Note: the dashboard's *Send password recovery email* button redirects to the
Site URL (the homepage) rather than the reset page, so prefer the in-app
flow above.

Security notes:

- Passwords live only in Supabase Auth — none are hardcoded in this repo.
- The browser bundle uses the anon key only; `SUPABASE_SERVICE_ROLE_KEY`
  exists solely as an Edge Function secret (auto-injected by Supabase).
- Route protection is a client gate, but authorization is server-side: the
  session JWT is validated by PostgREST during the `app_admins` probe and
  every admin query is restricted by RLS `is_admin()` policies. A signed-in
  non-admin sees nothing and can read nothing.
- Logout revokes the refresh token server-side (global scope) and clears the
  local session.

## Bitcoin exception columns

`trades` carries `btc_amount`, `btc_usd_value`, `btc_valued_at`,
`btc_valuation_source` (public recordkeeping) and `btc_wallet_address`,
`btc_transaction_id` (private verification only — excluded from every public
view). See build spec §38.

## Edge Functions (playbook PROMPT 6)

| Function | Purpose |
| --- | --- |
| `follow-signup` | Public email-preference capture: validation, honeypot, rate limiting, upsert with resubscribe semantics, guarded Resend confirmation |
| `email-preferences` | Signed-token unsubscribe (`action: "unsubscribe"`); unsubscribing auto-removes the follower from the public wall via the view filter |
| `offer-upload` | Issues signed upload URLs for private `offer-uploads` photos (image allowlist, size cap, rate limit) plus an HMAC submit token binding the path to the later submission |
| `submit-offer` | Public trade-offer submission: full validation, authoritative current-item snapshot with stale-submission rejection (spec §26), HMAC + existence verification of photos, insert into `offers`/`offer_files` |
| `send-broadcast` | Admin-only (session JWT + `app_admins`): sends a reviewed draft broadcast with an explicit confirm flag, Resend batches of ≤100, per-recipient logging to `email_broadcast_recipients`, unsubscribe exclusion, and no re-send of already-delivered addresses (spec §7) |
| `track-event` | Public fire-and-forget analytics: event allowlist + length caps, rate limited, inserts into `analytics_events`; never accepts sensitive form data (spec §13) |

Shared helpers live in `functions/_shared/` (email validation, HMAC
preference tokens, CORS allowlist, rate limiting, Resend client, broadcast
audience/batching). The pure helpers are unit-tested from
`tests/preferences.test.ts` and `tests/broadcast.test.ts`.

### Required secrets

```bash
# one-time, generates the HMAC secret for unsubscribe tokens
supabase secrets set PREFERENCE_TOKEN_SECRET=$(openssl rand -hex 32)
```

### Optional (email sending; functions fail gracefully without it)

```bash
supabase secrets set RESEND_API_KEY=...
supabase secrets set RESEND_FROM="ONE → FIVE <hello@spudchallenge.online>"
supabase secrets set PUBLIC_SITE_URL=https://spudchallenge.online
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### Deploy

```bash
supabase functions deploy follow-signup
supabase functions deploy email-preferences
supabase functions deploy offer-upload
supabase functions deploy submit-offer
supabase functions deploy send-broadcast
supabase functions deploy track-event
```

Note: `offer-upload`/`submit-offer` reuse `PREFERENCE_TOKEN_SECRET` (with
domain separation) for the photo submit-token HMAC — no additional secret
required.

### CORS (no dashboard configuration needed)

Verified against current Supabase behavior:

- **Edge Functions** enforce CORS in code (`functions/_shared/cors.ts`):
  exact allowlist — `https://spudchallenge.online`,
  `https://oaqwoods.github.io`, `http://localhost:3000` — no wildcards,
  `OPTIONS` preflight handled, disallowed origins 403 on POST.
- **Supabase Storage** serves its own platform-level CORS (token-authorized
  signed uploads), so browser photo uploads via `uploadToSignedUrl` work
  without any project setting. There is no "Allowed CORS origins" dashboard
  setting to configure.

Functions are Deno code and are intentionally excluded from the app's
`tsc`/ESLint scope.
