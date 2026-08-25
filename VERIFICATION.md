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
