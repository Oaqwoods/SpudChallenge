# ONE → FIVE
## Qwen Build Specification
### $1 → $5,000,000 in 21 Days

## 1. Product Summary

Build a fast, mobile-first public website and lightweight private admin backend for a 21-day barter challenge.

The premise:

> Start with $1. Trade it for something better. Keep trading for 21 days. Try to reach $5,000,000 in verified market value.

This is not a marketplace, ecommerce product, social network, or payment platform.

The website has three jobs:

1. Show the current state of the challenge.
2. Collect legitimate trade offers.
3. Build an email audience that follows every completed trade.

The challenge operator manually reviews offers, coordinates trades offline/in person, verifies values, completes the exchange, and then publishes the completed trade through the admin dashboard.

## 1A. Brand Identity

Public brand:

- Primary title: ONE → FIVE
- Core challenge line: $1 → $5,000,000 in 21 Days
- Tagline: 21 Days. Only Trades.
- Operator identity: A Trade Challenge by Spud

Use `Spud` as the public-facing identity instead of the operator's real name.

Recommended header stack:

- ONE → FIVE
- $1 → $5,000,000
- 21 DAYS. ONLY TRADES.
- A Trade Challenge by Spud

The challenge itself should remain the main brand. `Spud` is the personality/host behind the challenge, not the dominant brand over the title.

## 1B. Production Domain

Production domain and DNS assumptions are known up front:

- Canonical production URL: `https://spudchallenge.online`
- Domain registrar/DNS manager: Spaceship (`spaceship.com`)
- Primary public hostname: apex/root domain `spudchallenge.online`
- Preferred `www` behavior: `www.spudchallenge.online` should redirect to `https://spudchallenge.online` once configured
- The domain is currently unused by another website or email service

Architecture requirements:

- Treat `https://spudchallenge.online` as the canonical production URL from the beginning.
- Do not bake `/SpudChallenge` or another GitHub repository subpath into production links, assets, canonical URLs, forms, redirects, or metadata.
- The default `github.io` project URL may be used for deployment testing/preview only.
- Production canonical metadata, sitemap URLs, Open Graph/share URLs, email links, and absolute public links must use `https://spudchallenge.online`.
- Supabase Auth production Site URL and allowed redirect URLs must include `https://spudchallenge.online` and any required admin callback routes.
- Supabase Edge Function CORS must explicitly allow the production origin.
- Resend links and sender-domain configuration must be updated for production as appropriate; do not expose Resend secrets in the frontend.
- DNS changes remain a manual owner action. The application, GitHub Actions workflow, or Qwen must not attempt to mutate Spaceship DNS automatically.
- README must document the exact GitHub Pages + Spaceship custom-domain setup and HTTPS verification process.

## 2. Core Product Principles

- Build in one day.
- Mobile-first.
- Extremely simple.
- No payment gateway.
- No public user accounts.
- No public comments.
- No public offer marketplace.
- No chat or messaging system.
- No social feed.
- No AI agent required.
- No automated trade acceptance.
- No unnecessary CMS.
- Prioritize in-person trades, especially early in the challenge.
- Email is the primary audience-retention channel.
- The website is the canonical home of the challenge.

## 3. Recommended Stack

Use the simplest stable stack possible:

- Frontend: Next.js configured as a static export
- Language: TypeScript
- Styling: Tailwind CSS
- Hosting: GitHub Pages
- Deployment: GitHub Actions
- Production domain: `https://spudchallenge.online` (DNS managed at Spaceship)
- Database: Supabase Postgres
- File storage: Supabase Storage
- Backend/API boundary: Supabase Edge Functions and narrowly scoped Postgres RPCs
- Admin authentication: Supabase Auth
- Email: Resend, called only from Supabase Edge Functions
- Analytics: lightweight privacy-conscious analytics
- Forms: static frontend calling secure Supabase Edge Functions with server-side validation

Important architecture rule:
GitHub Pages is static hosting. Do not build Next.js Server Actions, API routes, middleware-dependent backend logic, or any feature that requires a persistent Next.js server. All secret-bearing/dynamic backend work must run in Supabase Edge Functions/RPCs.

Avoid introducing additional services unless clearly necessary.

## 4. Public Website Structure

The public experience should primarily be one scrolling page.

### 4.1 Hero

Must immediately communicate:

- ONE → FIVE
- $1 → $5,000,000
- 21 Days
- Live countdown
- Current verified/estimated asset value
- Current trade number
- Primary CTA: I HAVE SOMETHING BETTER
- Secondary CTA: FOLLOW THE CHALLENGE

Suggested headline:

> $1 → $5,000,000  
> 21 Days. Only Trades.

Supporting copy:

> We started with one dollar. We can only trade what we currently have. No adding cash to a trade. The clock never resets.

### 4.2 Countdown

Display remaining:

- days
- hours
- minutes
- seconds

The challenge start/end timestamps should be editable in the admin dashboard.

When the challenge has not started:
- show launch date/time
- show “Challenge Starts In”

When active:
- show “Time Remaining”

When expired:
- show “Challenge Complete”

### 4.3 Current Item

Display prominently:

- hero image
- item name
- short description
- current estimated/verified market value
- location/general region
- how value was established
- trade number
- date acquired

CTA:

> I HAVE SOMETHING BETTER

Do not expose private trader data publicly.

### 4.4 Scoreboard

Show:

- Starting Value: $1
- Current Value
- Current Multiplier
- Completed Trades
- Time Remaining
- Goal: $5,000,000

Multiplier:

current_value / 1

### 4.5 Trade Journey

Visual history such as:

$1 → Coffee Maker → Headphones → Bicycle → Gaming PC → ???

Each completed trade card should contain:

- trade number
- item given
- item received
- prior value
- new value
- date
- 1–3 approved public images
- public city/state or broader general location only
- optional short public comment/story
- valuation summary

Do not show exact meeting locations or private logistics details.

Newest trade can appear first or the chain can run chronologically, but the sequence must be obvious.

### 4.6 How It Works

Keep this short.

1. See what we currently have.
2. Offer something better.
3. We review the offers.
4. If selected, we verify and arrange the trade.
5. The completed trade becomes the new challenge item.
6. Repeat until time runs out.

### 4.7 Rules

Public rules should be concise.

Core rules:

1. We start with $1.
2. We can only trade what we currently own.
3. No adding cash to a trade.
4. Every trade must be real.
5. You must own what you offer.
6. We choose the trade that best advances the challenge.
7. Values must be reasonably defensible.
8. Publicity does not count toward asset value.
9. Illegal, stolen, counterfeit, unsafe, or prohibited property is rejected.
10. Completed trades are final.
11. The 21-day clock never resets.
12. The final asset remains ours even if the $5M target is not reached.

Bitcoin note for the public rules: Bitcoin (BTC) is the only permitted cryptocurrency asset. It may be received or traded away as the current asset like any other asset, but BTC can never be added to a trade as supplemental consideration alongside another asset — the challenge only trades what it currently owns (see §38).

Place a disclaimer that the public rules are not a substitute for the detailed Terms of Participation.

### 4.8 FAQ

Include:

- What counts as a better trade?
- Do you have to take the highest-value offer?
- Can I offer something from outside the local area?
- Are you prioritizing in-person trades?
- Can I offer cash?
- Can I add cash to a trade?
- What happens when the 21 days end?
- Do completed trades reverse if the challenge fails?
- How do you determine value?
- What happens with cars, real estate, businesses, or other complicated assets?
- How can I follow every trade?

Important answer:
Completed trades remain completed. Failure means only that the $5M goal was not reached within 21 days.

### 4.9 Email Capture + Prelaunch Intent

CTA:

> FOLLOW EVERY TRADE

Use one email capture form with two independent choices:

- Email me every completed trade
- I might have something to trade when the challenge starts

Fields:
- email required
- first name optional
- email_updates_opt_in boolean
- trade_interest boolean
- at least one of the two choices must be selected
- optional public display name or first name for the follower wall
- explicit opt-in checkbox for appearing publicly on the follower wall

This is better than a single intent enum because a potential trader may not want every trade email, while a follower may have no trade interest.

Requirements:
- confirmation message
- unsubscribe support
- privacy language
- no unnecessary data collection
- never publish an email address
- never infer public consent from email signup
- public follower display is opt-in only

Potential traders should be segmentable so they can receive the challenge-launch/current-item message they explicitly requested. Only people with email_updates_opt_in=true should receive ongoing "every completed trade" broadcasts.

### 4.10 Public Follower Wall / Running List

Add a visible section on the homepage showing momentum around the challenge.

Display:

> PEOPLE FOLLOWING THE CHALLENGE

Show:
- total follower count, counting only people currently opted into ongoing challenge email updates
- a running list of opted-in public display names/first names
- newest opted-in followers may appear first
- optional general location only if the person explicitly supplies and opts in to display it

Privacy requirements:
- NEVER display email addresses
- NEVER display phone numbers
- NEVER expose the raw followers table
- default is private
- appearing on the public wall requires both email_updates_opt_in=true and explicit public-wall opt-in
- allow admin to hide/remove a public display entry
- if a person unsubscribes from ongoing challenge emails, they should automatically disappear from the follower wall because they are no longer a current follower
- use a separate safe public view/query containing only approved public fields

The follower wall is social proof, not a social network. No profiles, comments, likes, messaging, or follower interactions.

### 4.11 Share Current Trade

Provide simple sharing:

- Copy Link
- Email
- SMS/share-sheet where supported
- optional Facebook/X/Reddit share links

Do not require us to operate social-media profiles.

Share metadata/Open Graph should automatically reflect:

- current item
- current value
- trade number
- time remaining
- $1 → $5M challenge branding

## 5. Trade Offer Flow

### 5.1 CTA

Button:

> I HAVE SOMETHING BETTER

### 5.2 Offer Form

At the top of the form, show:

> You're offering a trade for: [CURRENT ITEM] — [CURRENT VALUE]

The form must carry the current challenge/trade version, but the Edge Function must verify that version against authoritative database state before accepting the submission.

Collect:

- name
- email
- phone number optional
- item name
- item description
- claimed approximate value
- item condition
- city
- state
- ZIP code optional
- whether they can trade in person
- how far they are willing to travel
- up to 5 item photos
- optional serial/model/VIN field
- optional link to comparable value/source
- short explanation: Why is this a good next trade?
- checkbox confirming they own the item and can legally transfer it
- checkbox acknowledging submission is not acceptance
- checkbox accepting Terms of Participation

Do not collect identity documents, titles, receipts, proof-of-ownership documents, or other sensitive verification documents in the first public form.

For shortlisted/high-value offers, ownership/authenticity/title verification happens privately/offline or through a later admin-only process.

If the current item changes while someone is filling out the form, do not silently attach their offer to the new item. Return a clear "The current trade changed—please review the new item before submitting" state.

### 5.3 Form Security

Implement:

- server-side validation
- file-type validation
- file-size limits
- rate limiting
- spam protection/honeypot
- sanitize text
- private storage for offer item photos
- signed URLs where needed
- do not expose Supabase service role key to browser
- basic abuse logging

### 5.4 Submission Result

After submission:

> Offer received.

Explain:
- submission does not guarantee acceptance
- we may contact them for verification
- do not transfer or ship anything until directly instructed

Optionally invite them to follow the challenge by email.

## 6. Private Admin Dashboard

Admin should require authentication.

### 6.1 Dashboard Overview

Show:

- challenge status
- countdown
- current item
- current value
- trade number
- new offers count
- shortlisted offers count
- followers count

### 6.2 Offer Management

Offer statuses:

- new
- reviewing
- shortlisted
- selected
- meetup_scheduled
- declined
- did_not_complete
- completed
- invalid/spam

Meaning:
- selected = chosen to pursue/verify; no trade has occurred
- meetup_scheduled = inspection/exchange meeting planned; no trade has occurred
- did_not_complete = meetup/attempt ended without an exchange
- completed = the real physical/legal transfer occurred

Allow:

- search
- filter by status
- sort by claimed value
- sort by distance/location
- view photos
- view contact info
- internal notes
- change status
- mark verification needed
- optionally record verified value
- schedule/record meetup details privately
- record why an attempted trade did not complete

Never automatically select, accept, or complete offers.
A selected offer may still be declined or marked did_not_complete after inspection.


### 6.3 Offer Detail

Show all submitted information.

Admin-only fields:

- internal notes
- verified market value
- verification method
- risk flags
- authenticity/ownership status
- contact history notes
- shortlisted score/manual priority

### 6.4 Moving Trades to the Main Page

Trades move to the public homepage through an explicit admin publishing workflow.

Do NOT manually edit homepage code for each trade.

Flow:

1. A submitted offer is reviewed in the admin dashboard.
2. Admin may shortlist one or more offers.
3. Admin may select an offer to pursue/verify.
4. Admin may schedule an in-person meetup/inspection.
5. At inspection, either party may walk away before ownership/possession is exchanged.
6. If no exchange occurs, admin marks did_not_complete or declined. Nothing changes publicly.
7. If the real exchange/transfer occurs, admin marks the offer completed and opens "Complete Trade."
8. Admin enters final public details, final challenge value, valuation evidence, story, general location, and approved public photos.
9. Admin previews exactly what will appear publicly.
10. Admin clicks PUBLISH TRADE.
11. A transactional backend operation publishes the trade and updates the challenge current item/value/trade number atomically.
12. Homepage automatically reads the latest published current item and published trade history from Supabase.
13. The new trade appears in the trade journey and becomes the new Current Item.
14. Scoreboard/multiplier/trade count update automatically.
15. A draft email update is prepared for admin review; it is not auto-sent.

The goal is a smooth single-step publishing transition: once admin completes and publishes the trade, the homepage should immediately and cleanly switch from the old current item to the new current item without any code edits.

Only completed AND published trades can appear on the public site.

A trade must never appear publicly because an offer was merely submitted, shortlisted, selected, or scheduled for a meetup.

### 6.5 Trade Completion Workflow

Admin can create a public completed trade only from an offer whose real-world/legal exchange has actually completed.

Required:

- item given
- item received
- outgoing value
- incoming verified/estimated value
- valuation method/evidence
- date/time
- public photo(s)
- short public story
- general location
- confirmation that physical/legal transfer is complete or binding as appropriate

When the incoming or outgoing asset is Bitcoin, the completion form must additionally capture the Bitcoin fields required by §38: BTC amount, USD fair-market value at completion, valuation timestamp, valuation source, and verification status/evidence. The recorded USD fair-market value becomes the frozen public challenge value; it is not re-marked as BTC market price moves afterward. No private keys, seed phrases, wallet credentials, or exchange credentials may be collected or stored.

On publish:

- update current item
- increment trade count
- update scoreboard
- add to trade history
- create/update share metadata
- prepare an email update

Do not auto-send email until admin reviews it.

### 6.5 Challenge Settings

Admin should edit:

- challenge title
- start timestamp
- end timestamp
- target value
- starting value
- starting/current item
- general location label
- challenge state: prelaunch / active / complete

Also provide a confirmation-protected "START CHALLENGE NOW" action that:
- sets start_at to the current timestamp
- sets end_at to exactly 21 days later
- sets status to active
- does not require a code deployment

Do not allow accidental repeated starts.

## 7. Email System

Email is central.

### 7.1 Welcome Email

Subject example:

> You're following $1 → $5M

Include:
- premise
- start date/time
- link to current challenge
- reminder that every completed trade will be emailed

### 7.2 Trade Update Email

Template:

Subject:
> TRADE #5: $850 → $1,400

Body:
- item traded away
- item received
- current value
- current multiplier
- time remaining
- short story
- current item photo
- primary CTA: HAVE SOMETHING BETTER?
- secondary CTA: FORWARD THIS TO SOMEONE WHO DOES

### 7.3 Email Controls

Must:
- prevent duplicate subscriptions
- maintain unsubscribe state
- not send to unsubscribed addresses
- log broadcast attempts/status
- allow admin preview before sending

## 8. Database Design

### 8.1 followers

- id uuid
- email text unique
- first_name text nullable
- source text nullable
- email_updates_opt_in boolean default false
- email_updates_opted_in_at timestamptz nullable
- email_updates_unsubscribed_at timestamptz nullable
- trade_interest boolean default false
- trade_interest_at timestamptz nullable
- public_wall_opt_in boolean default false
- public_display_name text nullable
- public_general_location text nullable
- public_visible boolean default true
- utm_source text nullable
- utm_medium text nullable
- utm_campaign text nullable
- landing_variant text nullable
- created_at timestamptz

### 8.2 offers

- id uuid
- name text
- email text
- phone text nullable
- offered_against_trade_number integer
- offered_against_item_name text
- offered_against_item_value numeric
- item_name text
- item_description text
- claimed_value numeric
- verified_value numeric nullable
- condition text
- city text
- state text
- zip text nullable
- in_person boolean
- travel_distance text nullable
- serial_or_model text nullable
- comp_url text nullable
- why_good_trade text
- ownership_confirmed boolean
- terms_accepted boolean
- status text
- meetup_scheduled_at timestamptz nullable
- meetup_general_location text nullable
- did_not_complete_reason text nullable
- last_contacted_at timestamptz nullable
- internal_notes text nullable
- verification_method text nullable
- utm_source text nullable
- utm_medium text nullable
- utm_campaign text nullable
- landing_variant text nullable
- created_at timestamptz
- updated_at timestamptz

### 8.3 offer_files

Public-submission files are item photos only.

- id uuid
- offer_id uuid FK
- storage_path text
- file_type text
- created_at timestamptz

Do not use this table for identity/title/ownership documents submitted by public users.

### 8.4 trades

- id uuid
- trade_number integer unique
- source_offer_id uuid nullable
- outgoing_item text
- incoming_item text
- outgoing_value numeric
- incoming_value numeric
- valuation_status text (estimated / verified)
- valuation_method text
- valuation_evidence text nullable
- btc_amount numeric nullable
- btc_usd_value numeric nullable
- btc_valued_at timestamptz nullable
- btc_valuation_source text nullable
- btc_wallet_address text nullable (private; never exposed in public views, emails, or share metadata)
- btc_transaction_id text nullable (private; never exposed in public views, emails, or share metadata)
- public_story text nullable
- public_participant_name text nullable
- publicity_release_confirmed boolean default false
- general_location text nullable
- completed_at timestamptz
- published boolean
- published_at timestamptz nullable
- updated_at timestamptz
- created_at timestamptz

The `btc_*` columns apply only when the incoming or outgoing asset of a trade is Bitcoin (see §38). A trade is a Bitcoin trade when `btc_amount` is present. `btc_wallet_address` and `btc_transaction_id` are private verification fields and must be excluded from every public view/query per §24.

### 8.5 trade_media

- id uuid
- trade_id uuid FK
- storage_path text
- alt_text text nullable
- sort_order integer

### 8.6 trade_documents

Private/admin-only records for signed receipts/agreements or later professional verification documents.

- id uuid
- trade_id uuid FK
- storage_path text
- document_type text
- created_at timestamptz

These files must never be exposed through public trade views.

### 8.7 challenge_settings

Single-row table or key/value configuration.

Fields:

- title
- subtitle
- starting_value
- target_value
- start_at
- end_at
- status
- current_item_name
- current_item_description
- current_item_value
- current_item_image_path
- current_item_general_location
- current_trade_number
- offers_paused boolean default false
- follower_signups_paused boolean default false
- public_notice text nullable
- updated_at

### 8.8 email_broadcasts

- id uuid
- trade_id uuid nullable
- subject text
- body_html/text
- audience_type text
- status
- sent_count integer default 0
- error_count integer default 0
- sent_at timestamptz nullable
- created_at timestamptz

## 9. Supabase Security

Use RLS.

Public users should only be able to:

- read published trade/public challenge data
- submit an offer through a controlled Supabase Edge Function
- submit/update email preferences through a controlled Supabase Edge Function

Public users must NOT be able to:

- read other offers
- read follower list
- modify challenge settings
- read private offer files
- access admin notes
- modify trade history

Admin operations must require authenticated Supabase admin authorization. Sensitive mutations should use authenticated Edge Functions or narrowly scoped Postgres RPCs rather than trusting browser-only checks.

Never expose:
- service role key
- Resend API key
- private storage buckets
- admin credentials

Never store (in the application, database, environment variables, or uploads):
- Bitcoin private keys
- seed phrases
- wallet credentials
- exchange credentials

## 10. Visual Direction

## 10A. Mascot Direction

Include a simple retro pixel-art potato mascot named `Spud`.

Mascot guidance:

- pixel-art / retro console inspired
- original design, not based on or copied from a Nintendo character or any specific copyrighted game asset
- charming, determined, memorable
- can be used lightly in the header, status areas, cards, or decorative UI moments
- should support the brand rather than overwhelm the challenge information
- may have a few simple expressions/poses if useful, but V1 only needs a single core mascot treatment

Important:
- do NOT use actual Nintendo artwork
- do NOT closely imitate a specific Nintendo character, sprite sheet, or UI screen
- capture the retro console spirit while remaining clearly original

The site should feel inspired by classic console-era challenge screens, while the mascot makes the experiment feel distinctive and ownable.

The public site should feel like an old-school console game challenge screen, inspired by retro late-1980s / early-1990s home-console aesthetics.

Style should feel:

- bold
- nostalgic
- slightly mysterious
- credible
- fun but not childish
- fast
- internet experiment, not corporate SaaS

Primary aesthetic direction:

- retro video-game UI
- pixel/arcade typography
- strong black background or other very dark base
- bright high-contrast text accents
- simple framed panels/cards
- minimal but intentional 8-bit/arcade visual language
- the site should feel like a challenge screen or world-map status screen from an old console game

Typography direction:

- use the uploaded arcade/pixel font reference at `/mnt/data/ghostwriter_images/context/7d178034-482d-56ca-bac8-5cc29ab9ed05.webp` as the visual reference for headings/display text
- preserve readability; body text can use a more readable secondary font if needed
- prioritize the pixel/arcade font for hero text, countdown labels, current value, trade number, section headers, CTA buttons, and scoreboard values

Avoid:
- overly playful cartoon visuals
- crypto aesthetics
- clutter
- excessive gradients/animations
- modern startup-dashboard feel on the public page
- exact copying of any copyrighted Nintendo UI screen; capture the retro console vibe without duplicating a specific game screen

Hero should make `$1 → $5,000,000` the dominant visual.

Countdown and current item should be immediately visible on mobile.

Use strong typography, large numbers, crisp panel boundaries, and a polished retro-game presentation.


## 10B. Header / Navigation Guidance

Keep the header minimal. The homepage should not feel like a personal profile or a typical corporate navbar.

Recommended visible header branding:

- ONE → FIVE
- optional smaller line: A Trade Challenge by Spud

Recommended simple navigation anchors:

- Current Trade
- Journey
- How It Works
- Rules
- Follow

Do not surface the operator's real full name prominently on the site.


## 11. Mobile Requirements

Design mobile-first.

On a phone, within the first screen users should understand:

- what the challenge is
- current value
- time remaining
- what is currently available to trade
- how to make an offer
- how to follow

Forms must be easy to complete from a phone.

Images should upload from camera roll/camera.

## 12. Performance and Accessibility

- optimized images
- lazy loading where appropriate
- semantic HTML
- keyboard-accessible controls
- sufficient contrast
- alt text
- proper form labels
- error/success states
- avoid unnecessary JavaScript
- fast mobile load

## 13. Analytics Events

Track at minimum:

- page_view
- follow_cta_clicked
- follower_submitted
- follower_wall_opt_in
- potential_trader_captured
- offer_cta_clicked
- offer_started
- offer_submitted
- share_clicked
- rules_viewed
- trade_detail_viewed

Do not collect unnecessary sensitive data.

## 14. SEO / Share Metadata

Provide:

- title
- description
- canonical URL
- Open Graph
- Twitter/X card metadata
- dynamic social preview based on current trade if feasible
- sitemap
- robots.txt

Suggested title:

> $1 → $5,000,000 | The 21-Day Trade Challenge

Suggested description:

> We started with $1 and have 21 days to trade our way to $5 million. Follow every trade or offer something better.

## 15. Safety / Operational Messaging

Public site should clearly state:

- do not ship or hand over property before direct confirmation
- submitted offers are not automatically accepted
- we prioritize safe, lawful, verified transfers
- prohibited/illegal/stolen/counterfeit goods will be rejected
- complicated/high-value transfers may require professional verification/closing

Do not publish precise home address or exact meeting locations.

## 16. Legal Separation

Build placeholders/pages for:

- Public Rules
- Terms of Participation
- Privacy Policy

Do not invent jurisdiction-specific legal guarantees.

Mark legal copy as requiring attorney review before launch.

## 17. Prelaunch Mode

Before Day 1:

Hero:
> $1 → $5,000,000
> Starts in [countdown]

CTA:
> FOLLOW THE CHALLENGE

Secondary CTA:
> SUBMIT A TRADE #1 OFFER

During prelaunch the public offer form is open: visitors may submit potential Trade #1 offers for the initial $1 item (see §17A). Prelaunch offers are collected only — no trade is selected or agreed to until the challenge officially begins.

Prelaunch should focus heavily on email capture.

## 17A. Prelaunch Trade #1 Offer Collection

Visitors may submit potential Trade #1 offers before the 21-day challenge starts:

- Offer submissions and photo uploads are allowed while challenge status is `prelaunch` or `active`.
- Prelaunch submissions are COLLECTED ONLY: no trade completion, no publishing, no change to the current item/value/trade number, no setting of start_at/end_at, no starting of the 21-day clock, and no offer transition beyond "new" — except marking blatant spam `invalid` — until the admin uses START CHALLENGE NOW.
- Prelaunch offers use the same server-side validation, rate limiting, CAPTCHA, honeypot, private storage, and UTM attribution as active offers.
- Prelaunch offers snapshot the authoritative current item (the initial $1) exactly like active offers; browser-supplied item/value information is not trusted.
- The prelaunch success message must make clear the offer was saved but not accepted, and that nothing is selected or agreed to until the challenge officially begins.
- Admin can see prelaunch offers (clearly identified as PRELAUNCH) but cannot select/agree/complete/publish them before the challenge starts; the only prelaunch workflow action is marking blatant spam `invalid` (terminal — it can never re-enter the trade workflow).
- Once START CHALLENGE NOW succeeds, previously collected offers become normal actionable offers; no resubmission is required.
- Collecting prelaunch offers never starts the challenge or affects challenge timing in any way.

## 18. Active Challenge Mode

During challenge:

Primary CTA:
> I HAVE SOMETHING BETTER

Secondary CTA:
> FOLLOW THE CHALLENGE

Show:
- current item
- countdown
- trade history
- scoreboard

## 19. Completed Mode

After end timestamp:

Show:

- CHALLENGE COMPLETE
- final asset
- final verified value
- total multiplier
- number of trades
- whether $5M goal was achieved
- complete trade history

Completed trades remain displayed permanently unless project owner removes the site.

## 20. Definition of Done for V1

V1 is done when:

- public page works on mobile and desktop
- countdown works
- current item displays
- scorecard computes correctly
- trade history displays
- trade offer form uploads photos and writes to Supabase
- email signup works
- admin login works
- admin can review/update offers
- admin can publish a completed trade
- publishing a trade updates public current item/history
- trade-update email can be previewed and sent manually
- RLS/private data protections are tested
- GitHub Pages production deployment succeeds through GitHub Actions
- environment variables are documented
- README contains local setup/deploy steps

Anything beyond this should be deferred unless it fixes a security, reliability, or launch-blocking issue.

## 21. Explicit Non-Goals for V1

Do NOT build:

- payment processing (including cryptocurrency payment processing)
- cryptocurrency other than Bitcoin (BTC is permitted as a challenge asset per §38; stablecoins, tokens, NFTs, and crypto derivatives remain excluded)
- wallet custody, key management, or exchange-credential integrations
- bidding
- public user profiles
- public offer browsing
- offer voting
- DMs
- chat
- comments
- marketplace escrow
- automated valuations
- automated trade acceptance
- native mobile app
- complex AI
- referral points
- gamification system
- social network
- multi-admin permissions
- elaborate reporting dashboard

## 22. Recommended Build Order

Optimize for getting the prelaunch email-capture page live early.

1. Initialize app and GitHub Pages static-export configuration.
2. Create Supabase schema/RLS/storage/Edge Function foundation.
3. Build public prelaunch hero + countdown.
4. Build email preference capture + follower wall.
5. Add basic UTM/landing-variant attribution.
6. Deploy the prelaunch site to GitHub Pages.
7. Verify email capture, privacy, and mobile UX in production.
8. Continue building current item + scoreboard + trade journey.
9. Build trade offer form + image uploads.
10. Build admin auth.
11. Build offer-management/state-machine workflow.
12. Build trade completion/publishing workflow.
13. Add email preview/send.
14. Add analytics and share controls.
15. Add rules/FAQ/legal placeholders.
16. Run security/abuse/static-hosting audits.
17. Seed initial $1 asset.
18. Keep status prelaunch until the operator deliberately starts the 21-day challenge.

Do not start the 21-day clock merely because the prelaunch website is live.


## 23. Prelaunch Email Segmentation

Prelaunch signup is both audience capture and trade-interest capture.

Use independent preferences:

- email_updates_opt_in = wants ongoing completed-trade emails
- trade_interest = may have something to trade when the challenge opens

At launch:
- people with email_updates_opt_in receive the general "The Challenge Has Started" message and ongoing completed-trade updates
- people with trade_interest receive the launch/current-item trade-interest message they requested
- if both are true, avoid duplicate launch emails

The public follower count includes only active email_updates_opt_in followers.

Do not treat trade_interest as an actual trade offer. It is only prelaunch interest.

## 24. Public Data Architecture

The public homepage must never query private tables in a way that exposes sensitive columns.

Recommended pattern:

- public published trades: safe public SELECT policy/view
- current challenge state: safe public settings view
- follower wall: dedicated public-safe view or endpoint returning only count + explicitly opted-in display fields

Email addresses and private offer data remain server/admin-only.



## 25. Trade State-Machine Rules

Enforce allowed transitions so a fast-moving admin cannot accidentally skip from a new offer to a public trade.

Typical path:

new → reviewing → shortlisted → selected → meetup_scheduled → completed → published trade

Alternative endings:

reviewing/shortlisted/selected/meetup_scheduled → declined

selected/meetup_scheduled → did_not_complete

Rules:
- completed requires an explicit admin confirmation that the real transfer occurred
- did_not_complete never changes the public current item/value
- published trade creation is separate from offer status
- software should not allow an offer itself to become public
- one failed selected offer must not prevent selecting a different shortlisted offer

## 26. Offer-to-Current-Item Integrity

Every offer must be tied to the exact current item/trade number visible when the visitor began/submitted the offer.

The secure submission function must snapshot authoritative:
- current_trade_number
- current_item_name
- current_item_value

Do not trust those values from the browser.

If the challenge advances before submission completes:
- reject the stale submission with a friendly "current trade changed" response, or explicitly mark it stale for admin review
- preferred V1 behavior: ask the visitor to review the new current item before resubmitting

This prevents a trader from unknowingly offering an item for something the challenge no longer owns.

## 27. Admin Safety / Recovery

Requirements:
- confirmation before publishing a trade
- idempotent publish action
- idempotent email-send action where practical
- no normal hard-delete for offers or trades
- allow safe correction of public story/photo/typo after publication
- historical value changes require explicit confirmation
- preserve audit timestamps
- pagination for offer lists
- clear mutation success/error states
- keep shortlisted offers available if a selected meetup fails

## 28. Volume / Abuse Protection

Prepare for a sudden burst of attention without adding unnecessary friction.

Implement:
- practical request rate limiting
- body-size limits
- maximum 5 item photos
- strict image MIME allowlist
- file-size limits
- spam honeypot
- optional CAPTCHA integration point, disabled unless needed
- paginated admin offer list
- thumbnail/lazy-load behavior rather than loading every full image

Public offer uploads should be images only. Do not accept arbitrary documents from anonymous/public visitors.

## 29. Valuation Recordkeeping

For every completed trade, preserve:
- submitter claimed value
- final challenge value
- valuation status: estimated or verified
- valuation method
- valuation notes/evidence
- evidence links/descriptions
- optional private appraisal/verification document added later by admin
- for Bitcoin trades: the additional BTC recordkeeping fields required by §38 (BTC amount, USD fair-market value at completion, valuation timestamp, valuation source, verification status/evidence), which are also the tax/accounting records establishing basis and fair-market value

The public scoreboard always uses the final admin-recorded challenge value, never claimed_value. For Bitcoin trades this is the frozen USD fair-market value recorded at completion.

Do not publicly label a value "verified" unless verification actually occurred.

## 30. Publicity / Participant Consent

A completed trade can be documented without publicly identifying the other trader.

Default:
- do not publish trader name
- do not publish trader contact details
- do not publish exact meetup location

If the public story includes an identifiable participant name/photo, admin must record that appropriate publicity consent/release was obtained before publishing that material.

## 31. Pause / Emergency Controls

Admin can temporarily:
- pause new offers
- pause new follower signups
- show a custom public notice
- resume submissions

Pausing does not automatically stop or extend the 21-day clock.

Use this for overload, safety issues, technical incidents, or professional/legal review.

## 32. Post-Challenge Archive / Export

After Day 21:
- disable new offers by default
- freeze official trade order
- display final asset/value/multiplier/trade count
- show whether the $5M goal was reached
- preserve the public trade journey
- preserve private admin records

Provide admin-only CSV export for:
- offers
- followers/preferences
- completed trades

Exports must not create public URLs.

## 33. Attribution / Ad Validation

Persist first-touch or submission-time attribution when available:

- utm_source
- utm_medium
- utm_campaign
- landing_variant

Capture this for follower/prelaunch submissions and trade offers so the $200 ad test can answer:
- which ad/landing variant generated followers
- which generated trade-interest leads
- which generated actual trade offers

Do not store unnecessary ad-tech identifiers or sensitive tracking data.


## 34. GitHub Pages Deployment Architecture

The frontend must be deployable as a static export to GitHub Pages. The required production domain is `https://spudchallenge.online`; the default GitHub Pages project URL is acceptable only as a temporary preview/testing URL.

Requirements:
- configure Next.js for static export
- no Next.js API routes
- no Server Actions
- no server middleware required for core functionality
- GitHub Actions builds and deploys the static output
- production assets/routes must work from the root of `https://spudchallenge.online` and must not depend on a `/SpudChallenge` base path
- frontend contains only public Supabase URL/anon-key style configuration
- Resend API key and Supabase service-role key, if required, live only in Supabase Edge Function secrets
- admin authorization is enforced by Supabase Auth + RLS/Edge Function checks, not merely by hiding UI
- set `https://spudchallenge.online` as the canonical production site URL in application configuration and metadata
- configure production Supabase Auth redirect URLs and Edge Function CORS for `https://spudchallenge.online`
- production sitemap, canonical tags, Open Graph/share URLs, and email links use `https://spudchallenge.online`
- document GitHub Pages custom-domain setup for the apex domain and optional `www` redirect
- document the manual Spaceship DNS steps; never automate DNS changes from the repository
- enable/enforce HTTPS only after GitHub validates the custom domain and certificate availability

Dynamic backend work:
- public email signup/update -> Edge Function
- public offer submission -> Edge Function
- private upload authorization -> Edge Function or authenticated Supabase Storage policy
- email sending -> Edge Function
- atomic trade publishing -> authenticated Edge Function calling a Postgres function/RPC, or a secure transactional RPC directly
- admin CSV export -> authenticated client/RPC/Edge Function

Because GitHub Pages is static, dynamic per-trade Open Graph images are a deferred enhancement unless implemented through a separate edge endpoint. V1 may use a strong generic challenge share image.

## 35. Email Preference Semantics

Never conflate "potential trader" with "subscriber."

A person may:
- follow every trade only
- express trade interest only
- do both

Ongoing completed-trade broadcasts require email_updates_opt_in=true.

Trade-interest communications should be limited to the challenge-opening/current-item communications reasonably associated with the person's explicit trade-interest selection unless they also opt into ongoing updates.

Duplicate email submissions should update preferences safely rather than creating duplicate rows.

## 36. Safe External Links and Text Rendering

Offer descriptions, valuation links, and user-entered text are untrusted.

Requirements:
- render submitted text as text, never raw HTML
- validate URLs before storing/displaying
- admin external links open safely with appropriate rel attributes
- never auto-fetch arbitrary submitter URLs from privileged backend infrastructure
- do not embed arbitrary remote HTML/media supplied by offer submitters


## 37. High-Value Final Trade Pending Closing

The normal rule remains: a trade does not change the public asset chain until the transfer is completed.

If the final potential $5M+ transaction is a legally complex asset that cannot close before the deadline, do not treat ordinary "selected" or "meetup_scheduled" status as success.

Only after attorney/professional review, the operator may use a special public message such as:

> Final qualifying trade agreement signed — closing pending.

This should not automatically replace the current asset or claim unconditional success until the legal criteria in the attorney-reviewed challenge rules are satisfied.

Do not build this special flow unless it becomes necessary. It is an operational/legal exception, not part of ordinary V1 trade processing.

## 38. Bitcoin Exception (BTC)

Bitcoin is the only cryptocurrency permitted as a challenge asset. This section is the sole exception to the cryptocurrency exclusion in §21.

Permitted:

- BTC may be received as the incoming asset of a completed trade and become the current asset.
- If BTC becomes the current asset, it may be traded for the next asset in the chain like any other asset.
- BTC follows the same admin offer-review, completion, and publishing workflow as any other asset. Nothing about a BTC trade is automated.

Excluded (remain V1 non-goals):

- all other cryptocurrencies, stablecoins, tokens, NFTs, and crypto derivatives
- BTC (or any crypto) used as supplemental consideration added to a trade for another asset; the challenge only trades the current asset, consistent with "No adding cash to a trade"
- wallet custody, key management, and cryptocurrency payment processing

Bitcoin valuation recordkeeping:

For every completed trade where BTC is incoming or outgoing, record in the trades table:

- BTC amount (`btc_amount`)
- USD fair-market value at completion (`btc_usd_value`)
- valuation timestamp (`btc_valued_at`)
- valuation source (`btc_valuation_source`)
- verification status/evidence (existing `valuation_status`, `valuation_method`, `valuation_evidence` columns)

Value freeze:

- When a BTC trade is completed and published, the public challenge value is frozen at the USD fair-market value recorded at completion.
- The scoreboard must never be re-marked automatically as the BTC market price moves afterward.
- Correcting a recorded BTC value is a historical value change and requires the explicit confirmation required by §27.

Security and privacy:

- Never store Bitcoin private keys, seed phrases, wallet credentials, or exchange credentials in the application, database, environment variables, or file storage. Custody and any transfers happen entirely outside the application, operated manually by the owner.
- Do not build wallet custody or cryptocurrency payment-processing functionality.
- Wallet addresses (`btc_wallet_address`) and transaction IDs (`btc_transaction_id`) are not automatically public. They may be retained privately in the admin-only trades columns when needed for verification, and must never appear in public trade views, share metadata, emails, or non-admin exports (see §24 and §32).

Tax/accounting recordkeeping:

- Preserve the records needed to establish basis and fair-market value for every BTC trade: BTC amount, USD fair-market value at completion, valuation timestamp, valuation source, and verification evidence.
- Admin CSV exports (§32) include these fields for admin use only.
