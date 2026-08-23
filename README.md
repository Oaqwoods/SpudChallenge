# ONE → FIVE

**$1 → $5,000,000 in 21 Days. 21 Days. Only Trades. A Trade Challenge by Spud.**

Public website + lightweight private admin backend for a 21-day barter challenge:
start with $1, trade up over 21 days, and try to reach $5,000,000 in verified
market value. Offers are reviewed manually by the operator; trades happen
offline/in person; completed trades are published through the admin dashboard.

The full product and security requirements live in `QWEN_BUILD_SPEC(1).md`.
The step-by-step build prompts live in `QWEN_PROMPT_PLAYBOOK(1).md`.
The security model, known limitations and operational precautions live in
`SECURITY.md`.
The end-to-end verification of the data-driven trade publishing flow lives
in `VERIFICATION.md`.

## Stack

- Frontend: Next.js (static export) + TypeScript + Tailwind CSS
- Hosting: GitHub Pages via GitHub Actions
- Backend/API: Supabase (Postgres + RLS, Storage, Auth, Edge Functions, RPCs)
- Email: Resend (called only from Supabase Edge Functions)

GitHub Pages is static hosting. There are no Next.js API routes, Server
Actions, or server middleware; all secret-bearing/dynamic work runs in
Supabase Edge Functions and narrowly scoped Postgres RPCs.

## Local setup

Prerequisites: Node.js ≥ 20.9, npm.

```bash
npm install
cp .env.example .env.local   # fill in the public values below
npm run dev                  # http://localhost:3000
```

## Configuration

### Frontend / GitHub Pages (public, safe for the browser bundle)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (access governed by RLS) |
| `NEXT_PUBLIC_SITE_URL` | Canonical production URL: `https://spudchallenge.online` |

Rules:

- The canonical production URL is `https://spudchallenge.online` (DNS managed
  manually at Spaceship). Do not bake `/SpudChallenge` or any repository base
  path into production URLs, assets, canonical metadata, forms, or redirects.
- The default `github.io` project URL is for preview/testing only.

### Supabase Edge Function secrets (NEVER in the frontend bundle)

Configured only as Supabase Edge Function secrets:

- Supabase service-role key (only where an Edge Function genuinely requires it)
- Resend API key
- Resend sender/domain configuration

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build; static export lands in `out/` |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | Typecheck |

## Deployment

GitHub Actions (`.github/workflows/deploy.yml`) builds the static export and
deploys it to GitHub Pages on every push to `main`. DNS changes are always
manual owner actions at Spaceship; nothing in this repository mutates DNS.

### One-time GitHub setup

1. **Repository variables** (Settings → Secrets and variables → Actions →
   Variables): create `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`
   (`https://spudchallenge.online`). The workflow inlines them at build
   time; they are public by design and must not contain secrets.
2. **Pages source**: Settings → Pages → Source = **GitHub Actions** (the
   workflow's `configure-pages` step enables this automatically on first run).
3. **Custom domain**: Settings → Pages → Custom domain →
   `spudchallenge.online` → Save. The repo also ships `public/CNAME` with the
   same hostname; with the Actions source the Pages setting is authoritative.

### Spaceship DNS checklist (apex + www redirect)

Records below are GitHub's current official Pages requirements
(docs.github.com, "Managing a custom domain for your GitHub Pages site").
Create them in Spaceship's DNS manager for `spudchallenge.online`, replacing
any conflicting records (e.g. parking/default records) for the same host:

| Type | Host | Value | Purpose |
| --- | --- | --- | --- |
| A | `@` | `185.199.108.153` | Apex → GitHub Pages |
| A | `@` | `185.199.109.153` | Apex → GitHub Pages |
| A | `@` | `185.199.110.153` | Apex → GitHub Pages |
| A | `@` | `185.199.111.153` | Apex → GitHub Pages |
| CNAME | `www` | `oaqwoods.github.io` | www → Pages default domain (no repo name); Pages then redirects www to the apex |

Optional IPv6 (AAAA at `@`): `2606:50c0:8000::153`, `2606:50c0:8001::153`,
`2606:50c0:8002::153`, `2606:50c0:8003::153`.

Domain verification (recommended): GitHub's account-specific verification
TXT record is shown under Settings → Pages when you add the custom domain;
add it at Spaceship as instructed there. It is not a fixed value.

### DNS verification and HTTPS checklist

1. Wait for propagation (minutes to ~24h). Verify from any machine:
   `dig +short spudchallenge.online A` → the four GitHub IPs above;
   `dig +short www.spudchallenge.online CNAME` → `oaqwoods.github.io`.
2. In Settings → Pages, the custom-domain check should turn green.
3. Tick **Enforce HTTPS**. The option can take up to 24h to become available
   while GitHub provisions the certificate; retry later if it is greyed out.
4. Smoke-test: `https://spudchallenge.online` loads; the www URL redirects
   to the apex; canonical/OG tags point at the apex domain.

### Supabase setup

1. Create a project; apply all migrations in
   `supabase/migrations/` in filename order (`supabase db push` or paste each
   into the SQL editor). Migration 4 seeds the initial prelaunch
   `challenge_settings` row ($1 start, $5M target, status `prelaunch`).
2. Storage buckets: **public** `trade-media`, **private** `offer-uploads`.
   The repo's Supabase README documents the policies/permissions to apply.
3. Deploy Edge Functions (`follow-signup`, `email-preferences`,
   `offer-upload`, `submit-offer`, `send-broadcast`, `track-event`) and set
   function secrets: `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
   `RESEND_FROM`, `PREFERENCE_TOKEN_SECRET`.
4. Auth: create the operator's admin user (dashboard → Authentication), then
   insert their `auth.uid()` into `app_admins`. In Authentication → URL
   Configuration, add `https://spudchallenge.online/**` to the allowed
   redirect URLs.
5. CORS: the functions' allowlist already contains
   `https://spudchallenge.online` (see `supabase/functions/_shared/cors.ts`).

### Resend setup

Verify the sending domain in Resend (add the DNS records Resend provides at
Spaceship), then configure `RESEND_API_KEY` and `RESEND_FROM` as Edge
Function secrets. All email links use `NEXT_PUBLIC_SITE_URL`
(`https://spudchallenge.online`), so confirmation and unsubscribe links are
correct once the domain serves HTTPS.

### Admin bootstrap

1. Create the Supabase Auth user and add it to `app_admins` (step 4 above).
2. Sign in at `/admin/login/`. Non-admin sessions are refused and signed out.
3. Error logging is Supabase-side (function logs + `analytics_events`);
   there is no third-party error service in V1.

### Seeding the initial $1 challenge

Migration 4 seeds `challenge_settings` (title ONE → FIVE, $1 start,
$5M target, `prelaunch`) and migration 9 is the idempotent seed guard:
it inserts the canonical initial row if it is missing, never overwrites
an existing (admin-owned) row, and leaves `start_at`/`end_at` NULL —
the challenge dates are configured by the admin, never hardcoded.

Until a real photo is published, the Current Item panel shows the
replaceable placeholder `public/images/current-item-placeholder.png`.
Swap that file, or upload an image to the public `trade-media` bucket
and set `current_item_image_path` on the settings row; publishing the
first trade replaces it automatically. To reset or adjust: edit the
single row (`id = 1`) via the SQL editor or the admin dashboard.

### Switching prelaunch → active → complete

1. **Activate**: from the admin dashboard, open **Launch controls**
   (`/admin/settings/`). Either press **START CHALLENGE NOW** (confirm-
   protected; sets status `active`, `start_at` to now, `end_at` to
   `start_at + 21 days`), or set the schedule manually and save. Fill the
   current-item fields (the $1 item + photo in `trade-media`). Offers and
   follower emails open automatically.
2. **During**: publish completed trades through the trade workflow; drafts
   for broadcast emails appear under `/admin/emails/` and are sent only with
   explicit confirmation.
3. **Complete**: set status `complete` (or let `end_at` pass — the phase
   derives from the clock). The site shows the final result; offer/follower
   capture gates close automatically. Pauses are available at any time via
   `offers_paused` / `follower_signups_paused`.

For the full day-by-day owner runbook (launch, daily routine, completion,
emergencies), see [OPERATIONS.md](OPERATIONS.md).

## Analytics

Lightweight, privacy-light, first-party telemetry — no third-party SDKs, no
cookies, no identifiers. The client (`lib/analytics.ts`) fires events
fire-and-forget to the `track-event` Edge Function, which stores them in
`analytics_events` (admin-readable, service-role-writable).

Tracked events: `page_view`, `follow_cta_clicked`, `follower_submitted`,
`follower_wall_opt_in`, `potential_trader_captured`, `offer_cta_clicked`,
`offer_started`, `offer_submitted`, `share_clicked`, `rules_viewed`,
`trade_detail_viewed` — with pathname, UTMs and a coarse detail string
(e.g. share method or trade number) only.

Never recorded: emails, phone numbers, offer descriptions, uploaded files or
any other sensitive form data. The event allowlist and length caps in the
Edge Function make that structural.

## Project structure

```
app/            Next.js App Router pages and layout (static export)
public/         Static assets
.github/        GitHub Actions workflows (Pages deployment)
supabase/       Supabase migrations and Edge Functions (added as built)
```
