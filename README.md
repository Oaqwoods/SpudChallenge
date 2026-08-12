# ONE → FIVE

**$1 → $5,000,000 in 21 Days. 21 Days. Only Trades. A Trade Challenge by Spud.**

Public website + lightweight private admin backend for a 21-day barter challenge:
start with $1, trade up over 21 days, and try to reach $5,000,000 in verified
market value. Offers are reviewed manually by the operator; trades happen
offline/in person; completed trades are published through the admin dashboard.

The full product and security requirements live in `QWEN_BUILD_SPEC(1).md`.
The step-by-step build prompts live in `QWEN_PROMPT_PLAYBOOK(1).md`.

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
deploys it to GitHub Pages on every push to `main`.

Production go-live (custom domain) steps — GitHub Pages custom-domain setup,
Spaceship DNS records for the apex domain, `www` redirect, DNS verification,
and HTTPS enforcement — are documented as part of the deployment-prep
milestone (playbook PROMPT 18 / spec §1B, §34). DNS changes are always manual
owner actions; nothing in this repository mutates DNS.

## Project structure

```
app/            Next.js App Router pages and layout (static export)
public/         Static assets
.github/        GitHub Actions workflows (Pages deployment)
supabase/       Supabase migrations and Edge Functions (added as built)
```
