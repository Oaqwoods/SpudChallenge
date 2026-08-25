# Verification — ONE → FIVE

Scope: end-to-end verification that completed trades move to the public site
entirely through the admin workflow (playbook prompt 24). This is a
point-in-time audit of the code as of 2026-08-23; later prompts (25–27)
extend the workflow and will re-verify their own changes.

## Required flow

Offer submitted → admin reviews → shortlist/select → optional meetup →
real-world trade occurs → admin completes trade → admin previews public
content → admin publishes → homepage Current Item updates → Trade Journey
updates → scoreboard updates → email draft is created.

Every step below was traced through the code, not assumed.

## Verified guarantees

### 1. Non-published offers never appear publicly

- The `anon` role has **no table access at all** — RLS policies on `offers`
  (and every other challenge table) are `to authenticated` with
  `public.is_admin()` checks. There are no public SELECT policies and no
  public views over `offers` in any status
  (`supabase/migrations/20260812000002_rls_and_views.sql`).
- Public submissions enter through the `submit-offer` Edge Function
  (service role) with `status = 'new'`; there are no public INSERT policies.
- The public bundle never queries private tables. The only public-page data
  fetch is `lib/fetch-challenge.ts`, which reads the five `public_*` views.
  The offer form's only direct Supabase use is a signed-URL storage upload.

### 2. Only published completed trades appear publicly

- `public_trades` and `public_trade_media` filter on `published = true`.
- A trade row can only come into existence through the `publish_trade` RPC
  (`supabase/migrations/20260813000006_publish_trade.sql`), which requires
  the source offer to be `selected` or `meetup_scheduled`, sets the trade
  `published = true`, and flips the offer to `completed` — completion and
  publication are one atomic step, so an "unpublished completed trade"
  cannot exist in the current design.
- Public components (`current-item`, `trade-journey`, `scoreboard`) render
  exclusively from `useChallenge()`; none of them query tables directly.

### 3. No source-code edit required per trade

- Publishing writes the new current item into `challenge_settings`
  (name, description, value, image, location, `current_trade_number`) inside
  the same transaction as the trade insert. The homepage reads
  `public_challenge_settings` client-side, so the site advances on publish
  with no deploy. The static export is re-rendered by nothing — and needs to
  be, since all challenge data loads in the browser.

### 4. Updates are transaction-safe

- `publish_trade` is a single `plpgsql` function (SECURITY INVOKER, so every
  statement still passes RLS, plus an explicit `is_admin()` gate; EXECUTE
  granted to `authenticated` only).
- It locks the `challenge_settings` row (`FOR UPDATE`) so concurrent
  publishes serialize, and locks the offer row so the same offer cannot be
  completed twice — a second attempt blocks, then fails the status guard.
- All five writes (trade, media rows, settings, offer status, draft
  broadcast) commit together or not at all. There is no partial-publish
  state to recover from.
- Trade numbers are assigned as `current_trade_number + 1` under the
  settings-row lock, so numbering is monotonic and gap-free under
  concurrency.

### 5. Current item always matches the latest published trade

- Both the trade insert and the `challenge_settings` update happen in the
  same transaction; there is no window where they disagree.
- The current-item image takes the lowest `sort_order` uploaded photo; a
  trade published with zero photos sets the path to NULL and the homepage
  falls back to `public/images/current-item-placeholder.png` (file exists).

### 6. Preview and confirmation before publish

- The Complete Trade screen (`components/complete-trade-form.tsx`) separates
  public content from a clearly labeled private block, shows a live public
  preview card of exactly what the trade card will display, and requires an
  explicit "the real-world/legal transfer has actually completed" checkbox —
  mirrored server-side by the RPC's status/consent/validation checks.
- Publicity consent is enforced in both layers: a participant name cannot be
  published without `publicity_release_confirmed`.

### 7. Email draft is created, never auto-sent

- The RPC inserts the broadcast as `status = 'draft'` in the same
  transaction. Sending only happens through the admin Broadcast Center via
  the admin-JWT-verified `send-broadcast` Edge Function with an explicit
  confirmation step and per-recipient send log.

### 8. Private data never reaches public pages

- The public views deliberately omit: offer contact data (offers are not
  exposed at all), `source_offer_id`, `valuation_evidence`,
  `private_completion_notes`, `btc_wallet_address`, `btc_transaction_id`,
  `publicity_release_confirmed`.
- The browser client is built with the **anon key only**
  (`lib/supabase.ts`); service-role material exists only in Edge Function
  secrets.

## Verification runs (2026-08-23)

| Check | Result |
| --- | --- |
| `npm test` (unit suite incl. `publish-trade`, `admin-offers`, `broadcast`) | 104/104 pass |
| `npm run lint` | clean |
| `npm run build` (production build incl. TypeScript) | clean, 18/18 static pages |

## Remaining failure points / residual risks

None of these are launch-blocking; each is either owned by a later prompt or
accepted operational risk.

1. **No in-app correction path for a published trade.** There is no
   unpublish and no edit of published trade content. Today a typo in a
   public story requires direct table edits in the Supabase dashboard;
   hiding a trade (`published = false`) removes it from the public views
   but leaves `challenge_settings.current_item*` pointing at it until the
   admin corrects the current item via Launch controls. → Owned by
   **prompt 27** ("safe edit of public typo/photo/story", "idempotent
   publish", confirmation-before-publication).
2. **Manual current-item corrections can drift from the trade list.**
   Launch controls lets the admin edit current-item fields directly (the
   correction lever above). When used without a trade publish, the Current
   Item panel's "Acquired" / "Value Established" lines still describe the
   last published trade. Cosmetic; acceptable for V1.
3. **Scoreboard counts `trades.length` as "Completed Trades".** Accurate
   today only because every trade row is created published. If prompt 25
   introduces completed-but-unpublished trade rows, this count must filter
   on published. Watch item for prompt 25.
4. **No pagination on the trade list** — every public trade is fetched and
   rendered. Fine for a 21-day challenge; **prompt 27** adds pagination.
5. **Static/CDN caching after publish.** The data itself updates instantly
   (client-side fetch), and the provider re-fetches when a visitor returns
   to the tab (30 s throttle), but embeds/previews cached elsewhere can lag.
   Not a data-integrity issue.

## How to re-verify quickly

1. `npm test && npm run lint && npm run build`.
2. Confirm `public_trades` / `public_trade_media` still filter
   `published = true` and that no new view selects from `offers`.
3. Confirm `publish_trade` still locks the settings row before assigning
   `trade_number` and still writes trades + media + settings + offer status
   + draft broadcast in one function.
4. Confirm `lib/fetch-challenge.ts` reads only `public_*` views.

---

## Addendum — PROMPT 27 admin safety + recovery (2026-08-25)

This addendum records how the two residual risks above that prompt 24
deferred to prompt 27 were closed, plus the verification runs for the
prompt-27 changes. Point-in-time as of 2026-08-25.

### Residual risk #1 — no in-app correction path for a published trade → CLOSED

- A safe edit screen now exists at `/admin/trades/edit/?id=<uuid>`, reached
  from the new trades list (`/admin/trades/`). All writes go through
  `update_published_trade(...)`
  (`supabase/migrations/20260825000012_trade_safety.sql`), which is
  `SECURITY INVOKER` + `is_admin()` gated, locks the trade row, re-checks
  publicity consent, and writes trade + media + (when the trade is current)
  `challenge_settings` in a single transaction.
- Historical value changes require an explicit confirmation flag both in the
  UI (a checkbox that gates the Save button) and server-side (the RPC raises
  if values change without `p_confirm_value_change`). BTC trades hold a
  frozen USD fair-market value and reject value edits entirely.
- "Idempotent publish" is also in place: a retried `publish_trade` on an
  already-`completed` offer returns the existing trade instead of failing or
  duplicating.

### Residual risk #4 — no pagination on the admin lists → CLOSED (admin)

- The admin offer and follower lists now fetch every row page by page
  (`fetchAllRows` in `lib/admin-export`, mirroring send-broadcast) instead of
  a silent `.limit(500)`/`.limit(200)` cap, and render page by page
  (`lib/pagination`, `LIST_PAGE_SIZE = 25`). The new trades list is paginated
  the same way. Public trade rendering remains unbounded by design (21-day
  challenge) and is unchanged.
- Additionally, prompt 27's "no normal hard deletes" is now enforced at the
  database layer: `DELETE` on `offers`, `followers`, `trades` and
  `email_broadcast_recipients` is revoked from `authenticated` and the
  `admin_delete` policies dropped. `trade_media` keeps DELETE for photo-set
  replacement.

### Verification runs (2026-08-25)

| Check | Result |
| --- | --- |
| `npm test` (unit suite incl. new `admin-trades`, `pagination`, extended `admin-export`) | 137/137 pass |
| `npm run lint` | clean |
| `npx tsc --noEmit` | clean |
| `npm run build` (static export, incl. new `/admin/trades` and `/admin/trades/edit`) | clean, 21/21 static pages |

---

## Addendum — PROMPT 31 GitHub Pages static architecture audit (2026-08-25)

Point-in-time audit of the repository against every prompt-31 requirement.
**Result: no GitHub Pages blockers found; every requirement verified against
code, config, the deployed bundle and the live site.** Nothing needed to be
removed or replaced — the project was built static-first from day one.

| Requirement | Verdict | Evidence |
| --- | --- | --- |
| Next.js uses static export | ✅ | `next.config.ts`: `output: "export"`, `trailingSlash: true` (so every route is `/route/index.html`), `images.unoptimized` (no Node-only optimizer) |
| No Next.js API routes | ✅ | No `app/api/` directory exists |
| No Server Actions | ✅ | Zero `"use server"` directives in `app/`, `components/`, `lib/` |
| No runtime middleware | ✅ | No `middleware.ts`; the admin gate is a client-side check and the real authorization is server-side (PostgREST JWT + RLS) |
| GitHub Actions builds and deploys the static output | ✅ | `.github/workflows/deploy.yml`: `npm ci` → `npm run build` (NEXT_PUBLIC vars from Actions *variables*) → `upload-pages-artifact` of `out/` → `deploy-pages`, on every push to `main` |
| Bundle contains no Resend/service-role material | ✅ | Three layers: frontend code never references them, `tests/admin-auth.test.ts` walks `app/components/hooks/lib` and fails on any `service_role` pattern, and the **deployed** chunks were downloaded and scanned — only library method names matched (`resend()` OTP, OAuth-admin API surface); the only embedded JWT decodes to `"role": "anon"` |
| Public submissions call Edge Functions | ✅ | offer form → `offer-upload`/`submit-offer`, follow form → `follow-signup`, unsubscribe → `email-preferences`, analytics → `track-event` — all via `callEdgeFunction` with the anon key |
| Explicit production CORS allowlist | ✅ | `_shared/cors.ts`: exact origins `https://spudchallenge.online`, `https://oaqwoods.github.io`, `http://localhost:3000`; no wildcards; foreign origins 403; locked by `tests/cors.test.ts` |
| Admin mutations protected by Auth + RLS/RPC | ✅ | Session JWT validated by PostgREST on every query; RLS policies gate on `is_admin()`; `publish_trade`/`update_published_trade` are SECURITY INVOKER RPCs with `is_admin()` gates and `EXECUTE` limited to `authenticated`; `send-broadcast` re-verifies the JWT + `app_admins` server-side |
| Email only through Edge Functions | ✅ | `_shared/resend.ts` is imported only by `follow-signup` and `send-broadcast`; nothing in the frontend can send email |
| Atomic trade publication | ✅ | `publish_trade(...)` — single plpgsql function, settings-row `FOR UPDATE` serialization, five writes commit together or not at all (migration 6, idempotent replay added by migration 12) |
| Direct navigation to all exported pages | ✅ | Live check (2026-08-25): all 20 routes return 200 — `/`, `/offer/`, `/rules/`, `/privacy/`, `/terms/`, `/unsubscribe/`, every `/admin/*` page, `/og/challenge.png`, `/images/current-item-placeholder.png`, `/sitemap.xml`, `/robots.txt`; `/offer` 301-redirects to `/offer/`; `out/404.html` is emitted for unknown paths |
| Root URL without a `/SpudChallenge` base path | ✅ | No `basePath`/`assetPrefix`; canonical metadata targets the apex; README forbids baking a repo path into URLs |
| Canonical/sitemap/OG/email links use the production URL | ✅ | `metadataBase = https://spudchallenge.online`; live HTML shows `rel=canonical`, `og:url`, `og:image` on the apex; `app/sitemap.ts` emits apex URLs only; Resend links use `siteUrl()` (defaults to the apex); share links use `NEXT_PUBLIC_SITE_URL` with a same-origin fallback |
| Auth redirects + Edge CORS allow the production origin | ✅ | Password recovery `redirectTo` is `https://spudchallenge.online/admin/reset-password` (documented + allowlisted); CORS list contains the apex (above) |
| Pages + Spaceship setup documented incl. www → apex | ✅ | `README.md` → Deployment: one-time GitHub setup (Actions variables, Pages source, custom domain + `public/CNAME`), Spaceship DNS checklist (four A records, `www` CNAME → `oaqwoods.github.io` so Pages redirects www to apex, optional AAAA, domain verification), and the HTTPS enforcement/smoke-test checklist |
| Generic static OG metadata | ✅ | Static `openGraph`/`twitter` metadata in `app/layout.tsx` with `public/og/challenge.png` (1200×630) — no dynamic edge solution exists or is needed for V1 |

### Production build (2026-08-25)

`npm run build` (Turbopack) compiled clean: 21/21 static pages prerendered;
`out/` contains `index.html`, `404.html`, `CNAME`, `sitemap.xml`,
`robots.txt` and every route directory. **Reported blockers: none.**

Live-verified behaviors: apex serves all routes over HTTPS, bare paths
301-upgrade to trailing slashes, `https://www.spudchallenge.online/`
301-redirects to the apex, and the admin area loads (authorization still
happens server-side).

---

## Addendum — PROMPT 33 email consent / duplicate audit (2026-08-25)

Point-in-time audit of the email-preference logic against every prompt-33
requirement (the three independent-choice options plus all seven audit
bullets). **Result: everything already implemented — no code changes
needed.** Evidence below, verified by reading the actual files.

| Requirement | Verdict | Evidence |
| --- | --- | --- |
| Independent choice of ongoing emails / trade interest / both | ✅ | Two separate boolean columns (`email_updates_opt_in`, `trade_interest`) with `followers_at_least_one_intent` requiring at least one (migration 1); follow-signup writes each flag independently from the request |
| Duplicate submissions update, never duplicate | ✅ | follow-signup reads by normalized email first and UPDATEs the existing row (never a second INSERT); the `followers_email_key` unique constraint makes duplication impossible even under a race |
| No silent opt-in to ongoing emails via trade interest | ✅ | The duplicate-update path sets `email_updates_opt_in` only when the ongoing box is checked; `trade_interest` alone updates only `trade_interest` + its timestamp; audience types are resolved separately (`resolveAudience`) |
| Ongoing broadcasts include only active opted-in followers | ✅ | send-broadcast fetches the audience with `.eq("email_updates_opt_in", true)` AND `.is("email_updates_unsubscribed_at", null)`; `resolveAudience` re-applies both filters; locked by `tests/broadcast.test.ts` |
| Unsubscribe disables ongoing updates and removes wall eligibility | ✅ | email-preferences sets `email_updates_opt_in: false` + stamps `email_updates_unsubscribed_at`; `public_follower_wall` requires `email_updates_opt_in AND unsubscribed_at IS NULL AND public_wall_opt_in AND public_visible` (migration 2); admin-side mirror logic tested (`isOnWall`/`wallStatus` in `tests/admin-followers.test.ts`) |
| No duplicate launch emails when both flags are true | ✅ | Email is unique per person, so the `'all'` audience fetches each row once and `resolveAudience` de-duplicates case-insensitively (test: "segments trade interest and unions 'all', deduplicated"); the signup confirmation email is sent once per submission, covering both choices in one message; broadcast retries skip addresses already logged `sent` in `email_broadcast_recipients` |
| Preference timestamps preserved | ✅ | Duplicate updates use `existing.email_updates_opted_in_at ?? now` / `existing.trade_interest_at ?? now` — original opt-in times survive re-submissions; an explicit resubscribe clears `unsubscribed_at` and the next unsubscribe stamps a fresh one |
| Public follower count reflects active ongoing followers only | ✅ | `public_follower_count` counts exactly `email_updates_opt_in = true AND email_updates_unsubscribed_at IS NULL` (migration 2) |

### Verification runs (2026-08-25)

| Check | Result |
| --- | --- |
| `npm test` | 155/155 pass |
| `npx tsc --noEmit` | clean |
| `npm run build` (static export) | clean |
