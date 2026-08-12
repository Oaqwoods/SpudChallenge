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

## Applying the migrations

**Option A — Supabase CLI** (recommended):

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

**Option B — Dashboard SQL Editor:** paste and run the four files in
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

## Admin bootstrap

`app_admins` is intentionally empty. After the admin auth user exists
(playbook PROMPT 8), register it once with the service role / SQL editor:

```sql
insert into public.app_admins (user_id) values ('<admin auth user uuid>');
```

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

Shared helpers live in `functions/_shared/` (email validation, HMAC
preference tokens, CORS allowlist, rate limiting, Resend client). The pure
helpers are unit-tested from `tests/preferences.test.ts`.

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
```

Functions are Deno code and are intentionally excluded from the app's
`tsc`/ESLint scope. CORS is restricted to the production origin, localhost
dev, and the `*.github.io` preview host.
