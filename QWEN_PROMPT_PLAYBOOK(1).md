# ONE → FIVE
## Qwen Step-by-Step Prompt Playbook
### Use these prompts in order

## Operating Instructions

Give Qwen one prompt at a time.

After each step:

1. Let Qwen inspect existing code before changing anything.
2. Ask it to run relevant tests/build/typecheck.
3. Do not allow it to redesign unrelated parts of the project.
4. Commit or checkpoint after stable milestones.
5. If a step fails, fix that step before moving to the next one.
6. Keep the MVP scope tight. Do not add features not listed in the build specification.

---

# PROMPT 0 — PROJECT RULES

Paste this first:

You are the lead engineer for a one-day MVP called ONE → FIVE: a public 21-day challenge attempting to trade $1 into $5,000,000 through legitimate barter transactions.

Read the provided build specification completely before coding.

Your priorities, in order, are:

1. Security and privacy.
2. Reliability.
3. Mobile-first UX.
4. Fast implementation.
5. Simple maintainable code.
6. Visual polish.

Public brand:
- ONE → FIVE
- $1 → $5,000,000 in 21 Days
- 21 Days. Only Trades.
- A Trade Challenge by Spud

Critical scope rules:

- No payment gateway.
- Bitcoin (BTC) is permitted as a challenge asset per the build spec's Bitcoin exception; all other crypto (stablecoins, tokens, NFTs, derivatives) remains excluded, BTC can never be added as supplemental consideration to another asset, and no wallet custody, key/seed storage, wallet/exchange credentials, or crypto payment processing may be built.
- No marketplace.
- No public user accounts.
- No public offer browsing.
- No comments.
- No chat.
- No automated trade acceptance.
- No unnecessary AI.
- No native app.
- Use Next.js static export + TypeScript + Tailwind + GitHub Pages + GitHub Actions + Supabase + Resend.
- Canonical production URL is `https://spudchallenge.online`; DNS is managed manually at Spaceship.
- Do not bake `/SpudChallenge` or another repository base path into production URLs/assets. The `github.io` URL is preview/testing only.
- GitHub Pages is static: do not use Next.js API routes, Server Actions, or server middleware for core features.
- Put secret-bearing backend logic in Supabase Edge Functions and transactional logic in narrowly scoped Postgres RPCs.
- Use Supabase RLS.
- Never expose secrets or private offer data to the browser.
- Do not overengineer.

Before making changes:
1. Inspect the repository.
2. Summarize the existing structure.
3. Identify anything already implemented that should be reused.
4. Produce a concise implementation checklist.
5. Then begin only the first required build step.

Run typecheck/build/tests after meaningful changes.

---

# PROMPT 1 — INITIALIZE / AUDIT THE PROJECT

Inspect the repository and prepare it for the ONE → FIVE MVP.

Requirements:

- Next.js configured for static export
- TypeScript
- Tailwind
- GitHub Pages deployment via GitHub Actions
- clean environment-variable handling
- clear folder structure
- no unnecessary dependencies

If the project is already initialized, do not recreate it.

Create or update:
- README.md
- .env.example
- basic app shell
- reusable layout
- metadata defaults

Document configuration separately:

Frontend/GitHub Pages public configuration:
- Supabase URL
- Supabase anon key
- canonical production site URL: `https://spudchallenge.online`
- custom-domain production mode must not require `/SpudChallenge` as a base path
- default GitHub Pages URL may be supported as a preview/testing deployment without changing the production canonical URL

Supabase Edge Function secrets (never in frontend/GitHub Pages bundle):
- Supabase service role key only if an Edge Function genuinely requires it
- Resend API key
- sender/domain configuration

Do not implement product features yet.

At the end:
- run lint/typecheck/build
- show what changed
- list any setup actions I must perform manually

Important style note for the full project:
Use the uploaded arcade font image as a visual reference for the public-site aesthetic and heading style. Capture the retro console-game feel without reproducing a copyrighted screen exactly.

---

# PROMPT 2 — DATABASE SCHEMA + RLS

Implement the Supabase schema for ONE → FIVE.

Create migrations for:

followers
offers
offer_files
trades
trade_media
trade_documents
challenge_settings
email_broadcasts

Use UUID primary keys where appropriate.

Offer statuses:
new
reviewing
shortlisted
selected
meetup_scheduled
declined
did_not_complete
completed
invalid

Challenge statuses:
prelaunch
active
complete

Important:
offer.status=completed only means the real-world exchange occurred. It still does not become public until a separate trade record is created and published.

Requirements:

- RLS enabled.
- Public users cannot query offers.
- Public users cannot query followers.
- Public users cannot access private offer files.
- Published trade data can be publicly read.
- Challenge public settings can be publicly read.
- Public offer and email-preference submissions should go through Supabase Edge Functions rather than broad public table permissions.
- Admin/server may manage all required records.
- Add indexes for common filtering/sorting.
- Use appropriate constraints.
- Include timestamps.
- Include the nullable Bitcoin columns on trades required by the build spec's Bitcoin exception: btc_amount, btc_usd_value, btc_valued_at, btc_valuation_source, and the private verification fields btc_wallet_address and btc_transaction_id, which must never appear in public trade views, share metadata, or emails.

Create private storage for offer uploads and public storage or controlled access for published trade media.

Seed one challenge_settings row configured for:
starting_value = 1
target_value = 5000000
status = prelaunch

Do not seed real personal data.

At the end:
- explain RLS behavior
- run any applicable validation
- identify migration commands I need to execute

---

# PROMPT 3 — PUBLIC HOMEPAGE

Build the public mobile-first homepage.

Primary visual:
ONE → FIVE
$1 → $5,000,000
21 Days. Only Trades.

Required sections:

1. Hero
2. Challenge countdown
3. Current item
4. Scoreboard
5. Primary CTA: I HAVE SOMETHING BETTER
6. Secondary CTA: FOLLOW THE CHALLENGE
7. Trade journey
8. How It Works
9. Public Rules
10. FAQ
11. Email signup
12. Footer/legal links

Design direction:
- retro old-console / old-Nintendo-era game vibe without copying a specific copyrighted screen
- bold
- credible
- nostalgic
- slightly mysterious
- not corporate SaaS
- not crypto aesthetics (visual style only; BTC is a permitted challenge asset)
- minimal animation
- excellent mobile hierarchy
- use a pixel/arcade display-font look for headings and scoreboard UI based on the provided font reference
- body text may use a more readable supporting font if needed

Within the first mobile viewport, a visitor should understand:
- the goal
- the current value
- time remaining
- current item
- how to offer a trade
- how to follow

Use real database data where implemented.
Use graceful fallback/empty states.

Do not build the trade form yet.

Run build/typecheck when done.

---

# PROMPT 4 — COUNTDOWN + CHALLENGE STATES

Implement robust challenge timing.

Use start_at and end_at from challenge_settings.

States:

PRELAUNCH:
- "Challenge Starts In"
- countdown to start
- email CTA emphasized
- offer CTA may be disabled or labeled "Trade #1 Opens at Launch"

ACTIVE:
- "Time Remaining"
- live countdown
- offer CTA enabled

COMPLETE:
- "Challenge Complete"
- no negative countdown
- show final current value and result

Requirements:
- handle server/client hydration safely
- timezone-safe timestamps
- accessible countdown labels
- no hardcoded dates
- admin changes to challenge timing should propagate

Run tests/typecheck/build.

---

# PROMPT 5 — TRADE JOURNEY + SCOREBOARD

Implement the public trade history and metrics.

Scoreboard:
- Starting Value
- Current Value
- Multiplier
- Completed Trades
- Time Remaining
- Goal

Trade journey:
- chronological chain
- item given
- item received
- outgoing value
- incoming value
- date
- image if published
- short story
- valuation summary

Make the progression visually easy to understand.

Example:
$1 → Coffee Maker → Headphones → Bicycle → ???

Only published trade data may appear publicly.

Do not expose trader names/contact information unless explicitly stored as approved public story content.

Run build/typecheck.

---

# PROMPT 6 — EMAIL FOLLOW FORM

Build the FOLLOW THE CHALLENGE flow.

Public form:
- email required
- first name optional
- checkbox: "Email me every completed trade"
- checkbox: "I might have something to trade when the challenge starts"
- require at least one of those two choices
- optional public display name
- explicit optional checkbox: "Show my name on the follower wall"

Requirements:
- Supabase Edge Function validation
- lowercase/normalize email
- prevent duplicates
- resubscribe logic handled safely
- rate limiting
- honeypot/basic spam protection
- privacy copy
- success/error states
- no raw follower list exposed publicly
- NEVER expose email addresses
- store email_updates_opt_in and trade_interest independently for launch segmentation
- public display is opt-in only
- capture basic utm_source / utm_medium / utm_campaign / landing_variant from the landing session when present

Build a public follower-wall section that shows:
- total follower count based only on active ongoing-email followers
- only opted-in safe public display names whose email_updates_opt_in is still active
- no emails, phones, or private metadata
- admin ability to hide a wall entry

After successful signup, show confirmation that matches the selected preferences.

Email behavior:
- ongoing follower only: send the normal challenge welcome email
- trade-interest only: send a concise confirmation that we will contact them when the challenge/current trade opens as requested; do not call them an ongoing subscriber
- both: send one combined confirmation, not two duplicate emails

Integrate email through a Supabase Edge Function using Resend if configured.
If Resend is missing in local development, fail gracefully and do not lose the preference record.

Include an unsubscribe mechanism.

Run tests/build/typecheck.

---


# PROMPT 6A — PRELAUNCH DEPLOYMENT CHECKPOINT

At this point, deploy the prelaunch experience before building the full trade/admin system.

Production prelaunch must have:
- $1 → $5,000,000 premise
- 21-day challenge explanation
- prelaunch countdown/start messaging
- email preference capture
- follower count + opt-in follower wall
- basic How It Works / Rules links
- privacy/legal placeholders
- UTM/landing-variant capture
- GitHub Pages static deployment through GitHub Actions

Do NOT start the 21-day challenge clock.

Test in production:
- mobile layout
- email preference submission
- duplicate email preference update
- follower wall privacy
- unsubscribe link/flow if welcome emails are active
- no secrets in the browser bundle

Once this works, continue to Prompt 7 while the prelaunch page can collect emails.

# PROMPT 7 — TRADE OFFER FORM

Build the I HAVE SOMETHING BETTER flow.

At the top, show the authoritative current item the offer is being made against.

Fields:

- name
- email
- phone optional
- item name
- item description
- approximate claimed value
- condition
- city
- state
- ZIP optional
- can trade in person yes/no
- travel distance
- up to 5 item photos
- optional serial/model/VIN
- optional comparable-value URL
- why this is a good next trade
- ownership confirmation checkbox
- submission-is-not-acceptance acknowledgement
- Terms acceptance checkbox

Current-item integrity:
- include the current trade version in the client request
- the Edge Function must read authoritative current item/trade number from Supabase
- if the challenge advanced while the visitor was filling the form, return a friendly current-item-changed response and ask them to review/resubmit
- store offered_against_trade_number/item/value snapshots from authoritative backend data

Security:
- Edge Function/server-side validation
- sanitize text
- images only for anonymous/public uploads
- strict image MIME validation
- file extension validation
- file-size limit
- upload-count limit
- rate limiting
- spam honeypot
- private storage
- do not accept anonymous proof-of-ownership/title/identity documents
- randomized storage filenames/paths
- never trust client-supplied paths
- no direct database access from browser for private records
- validate optional comparable-value URL scheme/format
- render all submitted text as plain text, never HTML
- never auto-fetch submitter URLs from privileged backend code

After submission:

"Offer received. Do not transfer, ship, or hand over anything unless we directly confirm the trade."

Do not show offers publicly.

Run tests/build/typecheck.

---

# PROMPT 8 — ADMIN AUTH

Implement private admin access with Supabase Auth.

Requirements:
- protect /admin and all admin subroutes
- server-side authorization checks
- no admin UI leakage to unauthenticated visitors
- no hardcoded passwords
- no service role key in client bundles
- safe logout
- basic login error handling

Only one admin role is needed for V1.

Do not build complex RBAC.

Run auth/security checks and build.

---

# PROMPT 9 — ADMIN DASHBOARD

Build the admin overview.

Display:

- challenge state
- countdown
- current item
- current value
- current trade number
- number of new offers
- number shortlisted
- follower count

Offer list needs:
- status
- item name
- claimed value
- verified value if present
- city/state
- in-person indicator
- date submitted

Filters:
- status
- search
- sort by claimed value
- sort newest

Actions:
- open
- shortlist
- decline
- mark reviewing/shortlisted/selected as appropriate

Do not add automatic scoring yet.

Run build/typecheck.

---

# PROMPT 10 — OFFER DETAIL + VERIFICATION NOTES

Build the admin offer-detail page.

Show:
- all submitted offer information
- private uploaded photos/files using secure signed URLs
- contact information

Admin-editable fields:
- status
- internal notes
- verified value
- verification method
- authenticity/ownership notes
- risk flags
- contact notes

Add clear warning:
No offer is automatically accepted by the software.

Provide actions:
- Shortlist
- Select for Verification
- Schedule Meetup
- Decline
- Did Not Complete
- Invalid/Spam

Do not use "Accept" as a final-sounding workflow state.

Selecting/scheduling never changes the public challenge.
If inspection fails or either party walks away before transfer, mark did_not_complete.

Run build/typecheck.

---

# PROMPT 11 — COMPLETE + PUBLISH A TRADE

Build the trade-completion workflow.

A selected offer may become a completed trade only after the real-world/legal exchange actually occurs and the admin explicitly records completion.

Required inputs:
- item given
- item received
- outgoing value
- incoming verified/estimated value
- valuation method
- valuation evidence
- completed date/time
- public city/state or broader general location only
- public comment / short story
- public images
- private completion notes (admin only; never published)
- confirmation checkbox that the trade/transfer has actually been completed or otherwise qualifies under challenge rules
- if the incoming or outgoing asset is Bitcoin (per the build spec's Bitcoin exception): BTC amount, USD fair-market value at completion, valuation timestamp, valuation source, and verification status/evidence; optionally private wallet address/transaction ID for verification (never public)

For Bitcoin trades, the recorded USD fair-market value is the frozen public challenge value: do not re-mark the scoreboard as BTC market price moves afterward, and never collect or store private keys, seed phrases, wallet credentials, or exchange credentials.

The completion UI must clearly separate public comment from private notes so exact meetup details or internal logistics can never be accidentally published.

When published:
1. create the completed trade record with published=true
2. increment trade number correctly
3. update challenge current item fields from the newly received asset
4. update current value
5. make the new trade appear automatically in the public trade journey
6. make the newly received asset appear automatically as the homepage Current Item
7. update scoreboard and multiplier
8. prepare a draft email broadcast

The homepage must be data-driven from Supabase. Never require source-code edits to move a completed trade onto the main page.

Before publish, show an admin preview of the public trade card/current-item content.
The intended public card content should be: item name, public images, city/state or broader location, trade number, value change, valuation summary, and optional public comment.

Make this operation transaction-safe where possible so partial updates do not corrupt challenge state.

Require admin confirmation before final publish.

Run tests/build/typecheck.

---

# PROMPT 12 — TRADE EMAILS

Implement admin-reviewed trade-update emails.

Template data:
- trade number
- outgoing item/value
- incoming item/value
- current multiplier
- time remaining
- short public story
- current-item image
- link to challenge

Primary CTA:
HAVE SOMETHING BETTER?

Secondary CTA:
FORWARD THIS TO SOMEONE WHO DOES

Requirements:
- preview before send
- subject editable
- store broadcast record
- exclude unsubscribed followers
- batch safely
- log send status/errors
- do not resend accidentally without explicit confirmation

Suggested subject:
TRADE #5: $850 → $1,400

Run typecheck/build.

---

# PROMPT 13 — SHARING + OPEN GRAPH

Implement sharing without requiring us to maintain social accounts.

Add:
- Copy Link
- email share
- native Web Share API where supported
- optional X/Facebook/Reddit URLs

Dynamic share preview should emphasize:
- $1 → $5M
- current value
- current item
- days/time remaining
- trade number

Use strong generic challenge Open Graph metadata compatible with static GitHub Pages hosting. Dynamic per-trade Open Graph generation is optional/deferred unless implemented through a separate edge endpoint.

Do not add third-party social SDKs unnecessarily.

Run build/typecheck.

---

# PROMPT 14 — ANALYTICS

Implement lightweight analytics.

Events:
page_view
follow_cta_clicked
follower_submitted
offer_cta_clicked
offer_started
offer_submitted
share_clicked
rules_viewed
trade_detail_viewed

Do not record:
- offer descriptions
- phone numbers
- email addresses
- uploaded files
- other sensitive/private form data

Add a short analytics section to README.

Run build/typecheck.

---

# PROMPT 15 — SECURITY + ABUSE REVIEW

Perform a focused security review of the entire app.

Specifically inspect:

- RLS
- auth boundaries
- service role leakage
- Supabase Edge Functions / Postgres RPC authorization boundaries
- form injection
- XSS
- file upload abuse
- oversized payloads
- malicious MIME types
- path traversal
- signed URL exposure
- rate limiting
- spam
- email enumeration
- CSRF where applicable
- admin route protection
- logging of private data
- environment variables

Fix high/medium-risk issues that are relevant to this MVP.

Do not add enterprise-scale complexity.

Produce a short SECURITY.md describing:
- protections implemented
- known limitations
- operational precautions

Run tests/typecheck/build.

---

# PROMPT 16 — MOBILE UX + POLISH

Review the entire public flow on mobile widths.

Optimize:

- hero clarity
- countdown size
- current item visibility
- CTA prominence
- form ergonomics
- image upload
- error messages
- loading states
- trade journey readability
- email signup
- FAQ/rules
- page speed

The first screen should make sense in under 5 seconds.

Remove unnecessary visual clutter.

Run Lighthouse if practical and fix obvious performance/accessibility problems.

Run build/typecheck.

---

# PROMPT 17 — LEGAL PLACEHOLDERS

Create pages for:

- Public Rules
- Terms of Participation
- Privacy Policy

Public Rules may use the project rulebook.

Terms and Privacy pages must clearly indicate where attorney-reviewed final copy is still required.

Do NOT invent promises such as:
- guaranteed valuations
- guaranteed acceptance
- guaranteed safety
- tax treatment
- legal ownership conclusions

Add links in footer and forms.

Run build/typecheck.

---

# PROMPT 18 — DEPLOYMENT PREP

Prepare for GitHub Pages deployment using GitHub Actions.

Production domain source of truth:
- canonical URL: `https://spudchallenge.online`
- registrar/DNS manager: Spaceship
- primary hostname: apex/root domain `spudchallenge.online`
- preferred `www` behavior: redirect `www.spudchallenge.online` to `https://spudchallenge.online` once DNS is configured
- DNS changes are manual owner actions; do not mutate DNS automatically

Check:
- static export configuration
- GitHub Pages custom-domain behavior
- production build must not require `/SpudChallenge` as a base path
- GitHub Actions workflow
- frontend public env/config only
- Supabase Edge Function secrets configured outside the frontend
- production Supabase URLs/keys
- storage buckets
- database migrations
- Resend domain configuration
- canonical site URL
- admin authentication
- Supabase Auth redirect URLs for the production domain
- Edge Function CORS allowlist for the production domain
- email links
- sitemap URLs
- robots.txt
- canonical metadata
- Open Graph/share metadata
- error logging

Update README with exact:
- local setup
- Supabase setup
- migration steps
- Resend setup
- GitHub Pages + GitHub Actions deployment
- GitHub Pages custom-domain configuration for `spudchallenge.online`
- Spaceship DNS record checklist for the apex domain and `www` redirect, using GitHub's current official Pages documentation at deployment time
- DNS verification and HTTPS enablement checklist
- admin bootstrap
- how to seed initial $1 challenge
- how to switch prelaunch → active → complete

Run production build.

Do not deploy or alter DNS automatically unless explicitly instructed.

---

# PROMPT 19 — SEED THE CHALLENGE

Create a safe seed process for the initial challenge.

Initial state:

Title:
ONE → FIVE

Subtitle:
$1 → $5,000,000 in 21 Days

Starting Value:
$1

Target:
$5,000,000

Status:
prelaunch

Current Item:
One U.S. Dollar

Current Value:
$1

Trade Number:
0

Do not hardcode the challenge dates.
They must be configured through admin.

Add a placeholder image that I can replace.

Verify the public page correctly shows the prelaunch state.

---

# PROMPT 20 — FINAL MVP AUDIT

Audit the app against the complete ONE → FIVE build specification.

Create three lists:

1. Launch blockers
2. Important but non-blocking improvements
3. Deferred V2 ideas

Then fix every legitimate launch blocker.

Verify these complete user journeys:

FLOW A:
Visitor → homepage → email signup → welcome confirmation

FLOW B:
Visitor → offer CTA → offer submission with photos → confirmation

FLOW C:
Admin → login → review offer → shortlist/select

FLOW D:
Admin → complete trade → publish → public page updates

FLOW E:
Admin → preview trade email → send to subscribed followers

FLOW F:
Challenge transitions prelaunch → active → complete

Verify:
- no public offer data leakage
- no follower leakage
- private uploads remain private
- unsubscribe works
- mobile view works
- production build succeeds

Do not add V2 features during this audit.

Return a final launch checklist.

---

# OPTIONAL PROMPT 21 — CREATE INITIAL AD LANDING VARIANTS

Only use this after the MVP works.

Create 3 lightweight hero-copy variants for prelaunch testing without changing backend behavior.

Variant A:
Impossible Challenge

Variant B:
Participation / "I Have $1"

Variant C:
Curiosity / "What Can $1 Become?"

Do not build a full A/B testing platform.
Implement the simplest method for switching variants manually or by query parameter.

Keep ONE → FIVE branding consistent.

---

# OPTIONAL PROMPT 22 — ADMIN OFFER TRIAGE ASSISTANT

Only build after we have enough offers that manual review is slow.

Add a non-authoritative triage helper that can summarize offers and flag:

- claimed value
- location
- in-person feasibility
- missing information
- suspicious claims
- verification needed

It must NEVER:
- approve a trade
- reject a trade automatically
- determine legal ownership
- determine authenticity
- send messages without review

Human admin always makes the decision.

Do not build this for initial launch unless genuinely needed.


# PROMPT 23 — PRELAUNCH PREFERENCES + FOLLOWER WALL

Update the prelaunch email capture so one form has two independent checkboxes:

- Email me every completed trade
- I might have something to trade when the challenge starts

Require at least one selection.

Store:
- email_updates_opt_in
- trade_interest

Do not use a single intent enum.

Add optional public follower-wall participation:
- optional public display name/first name
- explicit checkbox consenting to public display
- default is NOT public

Homepage should show:
- total number of active ongoing-email followers
- running list of opted-in display names
- newest opted-in followers first if appropriate

Security/privacy:
- never display emails
- never display phone numbers
- never expose private follower columns
- follower wall requires email_updates_opt_in=true plus public-wall opt-in
- unsubscribing from ongoing emails removes the person from the follower wall automatically
- use a dedicated safe public query/view/endpoint
- admin can hide a public follower entry

Add admin filters/counts for:
- ongoing followers
- trade-interest leads
- people in both groups

Do not turn this into profiles or a social network.

Run security checks/build/typecheck.

# PROMPT 24 — VERIFY DATA-DRIVEN TRADE PUBLISHING

Audit and verify that completed trades move to the homepage entirely through the admin workflow.

Required flow:

Offer submitted → admin reviews → shortlist/select → optional meetup → real-world trade occurs → admin completes trade → admin previews public content → admin publishes → homepage Current Item updates → Trade Journey updates → scoreboard updates → email draft is created.

Requirements:
- submitted/shortlisted/selected/meetup-scheduled offers never appear publicly
- only published completed trades appear publicly
- no source-code edit required per trade
- updates are transaction-safe
- current item always matches the latest published completed trade
- admin can correct a publishing mistake without corrupting trade order/history
- public pages never receive private offer/contact data

Run end-to-end verification and report any remaining failure points.



# PROMPT 25 — TRADE STATE MACHINE + WALK-AWAY SAFETY

Refactor and verify offer workflow states:

new
reviewing
shortlisted
selected
meetup_scheduled
declined
did_not_complete
completed
invalid

Semantics:
- selected = chosen to pursue/verify only
- meetup_scheduled = meeting planned only
- either party may walk away before the actual exchange/transfer
- did_not_complete leaves public item/value/trade count unchanged
- completed requires explicit confirmation that the real transfer occurred
- only a separate completed + published trade record affects the public challenge

Enforce sensible state transitions in UI/backend so the operator cannot accidentally publish from a new/selected offer.

Add:
- meetup_scheduled_at
- meetup_general_location
- did_not_complete_reason
- last_contacted_at

Do not expose exact meetup locations publicly.

Run migration/typecheck/build and test the failed-meetup path.

# PROMPT 26 — OFFER TARGET INTEGRITY

Make every offer explicitly target the current challenge item.

Requirements:
- display "You're offering for [current item]" on the form
- client includes current trade/version
- Edge Function independently reads authoritative current_trade_number/current_item/value
- store offered_against_trade_number, offered_against_item_name, offered_against_item_value from backend-authoritative data
- never trust browser-supplied value/name
- if the challenge advanced during form completion, do not silently submit against the replacement item
- return a friendly current-item-changed response and require review/resubmission

In admin, clearly show which trade/current item each offer was made against.

Run tests/typecheck/build.

# PROMPT 27 — ADMIN SAFETY + RECOVERY

Add:
- confirmation before trade publication
- idempotent publish
- idempotent email send where practical
- no normal hard deletes
- safe edit of public typo/photo/story
- explicit confirmation before historical value changes
- pagination
- clear success/error states
- preserve shortlisted offers after a failed selected meetup

Add admin-only CSV exports for offers, followers/preferences, and trades.

Run security review/typecheck/build.

# PROMPT 28 — VOLUME / UPLOAD HARDENING

Prepare public endpoints for sudden traffic.

Requirements:
- rate limiting
- body-size limits
- max 5 item photos
- images only for anonymous/public uploads
- strict image MIME allowlist
- file-size limits
- private storage
- spam honeypot
- optional CAPTCHA integration point disabled by default
- pagination/lazy image loading in admin
- never collect anonymous identity/title/proof-of-ownership documents

Verify sensitive/private data is not logged.

Run tests/typecheck/build.

# PROMPT 29 — VALUATION + PUBLICITY CONSENT

Add valuation recordkeeping:
- claimed value
- final challenge value
- valuation_status estimated/verified
- method
- evidence notes/links
- optional admin-added private verification document later
- for Bitcoin trades: BTC amount, USD fair-market value at completion, valuation timestamp, valuation source, verification status/evidence, and private-only wallet address/transaction ID when needed (these also serve as the basis/fair-market tax records)

Public score must use final challenge value.

Do not display "verified" unless valuation_status=verified.

Privacy:
- trader identity is private by default
- exact meetup location is private
- identifiable trader name/photo may only be published when admin confirms appropriate publicity consent/release

Add private trade_documents storage/table if not already present.

Run build/typecheck/security review.

# PROMPT 30 — PAUSE / ARCHIVE / ATTRIBUTION

Add admin controls:
- pause offers
- pause follower signups
- custom public notice
- resume

Pausing does not alter the challenge clock automatically.

At completion:
- disable new offers by default
- freeze trade order
- show final result
- retain archive/admin records

Capture basic attribution on follower/prelaunch submissions and offers:
- utm_source
- utm_medium
- utm_campaign
- landing_variant

This is for validating the initial ad spend.

Do not add invasive ad tracking.

Run build/typecheck.


# PROMPT 31 — GITHUB PAGES STATIC ARCHITECTURE AUDIT

Audit the repository specifically for GitHub Pages compatibility.

Requirements:
- Next.js must use static export
- remove/replace any Next.js API routes
- remove/replace any Server Actions
- remove any reliance on runtime Next.js middleware
- GitHub Actions builds and deploys the static output
- frontend bundle contains no Resend API key or Supabase service-role key
- public offer/email submissions call Supabase Edge Functions
- Edge Functions use an explicit production CORS allowlist/configuration appropriate for the GitHub Pages/custom domain frontend
- authenticated sensitive admin mutations are protected by Supabase Auth + RLS/Edge Function/RPC checks
- email sending occurs only through Supabase Edge Functions
- atomic trade publication uses a safe transactional database operation
- direct navigation to all exported static pages works on GitHub Pages
- production URLs/assets/routes work at the root of `https://spudchallenge.online` without a `/SpudChallenge` base path
- canonical metadata, sitemap, Open Graph/share URLs, and production email links use `https://spudchallenge.online`
- Supabase Auth production redirects and Edge Function CORS explicitly allow `https://spudchallenge.online`
- document exact GitHub Pages + Spaceship custom-domain setup and `www` → apex redirect

Use generic static Open Graph metadata for V1 unless a separate edge-based dynamic solution already exists.

Run production static export/build and report any GitHub Pages blockers.

# PROMPT 32 — START CHALLENGE NOW

Add a confirmation-protected admin action:

START CHALLENGE NOW

On confirmation:
- ensure challenge is currently prelaunch
- set start_at to the authoritative backend current timestamp
- set end_at to exactly 21 days after start_at
- set status=active
- prevent duplicate/repeated starts
- update the public site without requiring a code deployment

Also allow manually scheduling a future start_at/end_at if desired.

The 21-day duration should not depend on the admin's browser clock.

Run typecheck/build and verify the transition.

# PROMPT 33 — EMAIL CONSENT / DUPLICATE AUDIT

Audit email preference logic.

A person can independently choose:
- ongoing completed-trade emails
- trade-interest launch communication
- both

Requirements:
- duplicate email submissions safely update preferences instead of creating duplicates
- do not silently opt someone into ongoing emails because they expressed trade interest
- ongoing broadcasts include only active email_updates_opt_in followers
- unsubscribe disables ongoing updates and removes public follower-wall eligibility
- avoid duplicate launch emails when both flags are true
- preserve preference timestamps
- public follower count reflects active ongoing followers only

Run tests/typecheck/build.


# PROMPT 34 — FINAL EDGE-CASE CHECK

Without adding new product features, verify these failure cases:

1. User begins an offer for Item A, but Item B becomes current before submission.
2. Selected trade meetup happens but either party walks away.
3. Admin double-clicks Publish Trade.
4. Admin double-clicks Send Email.
5. A follower unsubscribes after opting into the public follower wall.
6. A trade-interest-only email lead must not receive ongoing trade broadcasts.
7. An anonymous upload attempts a non-image file.
8. A submitter enters a malicious/external URL.
9. Supabase temporarily fails while public page loads.
10. Offer volume reaches thousands of rows.
11. Admin corrects a typo in an already-published trade.
12. Challenge expires while an ordinary selected trade has not completed.
13. Challenge is paused for submissions but countdown continues.
14. Identifiable trader media is about to publish without recorded publicity consent.
15. A Bitcoin trade is completed and published; the scoreboard must stay frozen at the recorded USD fair-market value even as the BTC market price moves afterward.
16. Bitcoin trade recordkeeping contains no private keys, seed phrases, wallet credentials, or exchange credentials, and any stored wallet address/transaction ID never appears publicly.

Fix any launch-blocking behavior found.

Do not add a marketplace, social layer, payment system, or AI features.

Run final production static export/build.


# PROMPT 35 — RETRO GAME VISUAL STYLE

Update the public-site visual design so it feels like an old console game challenge screen.

Use the uploaded font reference image located at:
/mnt/data/ghostwriter_images/context/7d178034-482d-56ca-bac8-5cc29ab9ed05.webp

Requirements:
- use that image only as a style reference for pixel/arcade typography
- include an original retro pixel potato mascot named Spud as part of the brand direction
- Spud should feel like an original console-era mascot, not a copy of a Nintendo character
- do not copy a specific copyrighted Nintendo game screen exactly
- headings/display text should have a strong pixel/arcade look
- the page should feel like an old-school challenge/status screen
- dark background with high-contrast retro-style accents is preferred
- current value, countdown, trade number, and CTA buttons should feel game-like and visually exciting
- preserve accessibility and readability
- body copy can use a secondary readable font if necessary
- mobile experience must still be strong

Run build/typecheck and verify the visual hierarchy.

# PROMPT 36 — COMPLETE-TRADE PUBLISHING UI

Refine the admin Complete Trade publishing UI so it feels like a smooth publishing flow rather than raw database editing.

Requirements:
- when a real trade is completed, admin should open a single completion/publishing form
- fields should emphasize public-facing content:
  - item received
  - public value
  - public city/state or broader location
  - public images
  - public valuation note
  - public comment/story
- include a separate clearly labeled private-notes field for admin-only comments
- exact meetup location and sensitive details must never appear in public preview fields
- provide a preview step before publish
- once published, the old current item should transition cleanly to the new current item on the homepage and in the trade journey
- draft trade email is created after publish, not before

Run build/typecheck and verify the end-to-end publish flow.

# PROMPT 37 — SPUD BRANDING

Update the site branding so the public-facing identity is:

- ONE → FIVE
- $1 → $5,000,000
- 21 DAYS. ONLY TRADES.
- A Trade Challenge by Spud

Requirements:
- the challenge title ONE → FIVE remains the main visual brand
- `Spud` is the operator/host identity
- do not use the operator's real full name prominently in the public UI
- keep the header/navigation minimal
- make the site feel like a distinct internet experiment, not a personal portfolio

Run build/typecheck and verify all public branding is consistent.

# PROMPT 38 — CUSTOM DOMAIN GO-LIVE CHECKLIST

Prepare the production custom-domain go-live for ONE → FIVE.

Source of truth:
- canonical production URL: `https://spudchallenge.online`
- DNS provider/registrar: Spaceship
- primary hostname: apex/root domain `spudchallenge.online`
- `www.spudchallenge.online` should redirect to the apex domain if configured

Before any DNS change:
- confirm the GitHub Pages Actions deployment succeeds at its temporary GitHub Pages URL
- confirm production static export has no `/SpudChallenge` dependency
- confirm all production absolute URLs use `https://spudchallenge.online`
- confirm no secrets are present in the frontend bundle
- confirm Supabase Auth redirect URLs and Edge Function CORS are ready for the production domain
- confirm Resend/email links are production-domain aware

Then produce a manual owner checklist for:
1. GitHub repository Settings → Pages custom domain configuration
2. Spaceship Advanced DNS records required for GitHub Pages, using GitHub's current official documentation
3. optional `www` record/redirect to the apex domain
4. GitHub DNS verification
5. HTTPS certificate provisioning and Enforce HTTPS
6. final verification of `https://spudchallenge.online`
7. final verification that `www.spudchallenge.online` redirects to the apex domain if configured
8. sitemap, canonical, Open Graph, email-link, Supabase Auth, and CORS checks

Do not change DNS automatically. Do not guess DNS values if current official GitHub documentation differs; report the exact manual records the owner should enter at Spaceship.

Run the final production static export/build and report blockers before asking the owner to change DNS.

