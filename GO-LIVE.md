# Go-Live Checklist — `https://spudchallenge.online`

Owner-facing, manual checklist for the production custom-domain go-live of
**$1 → $5M** (ONE → FIVE). The domain is **already live** as of 2026-08-25;
use this document to re-verify the setup or to rebuild it on a new
repository/domain. **Nothing here changes DNS automatically — every DNS edit
is a manual owner action at Spaceship.** If GitHub's current official
documentation ever differs from the values below, follow the official
documentation.

Source of truth:

- Canonical production URL: `https://spudchallenge.online`
- Registrar / DNS provider: **Spaceship**
- Primary hostname: apex `spudchallenge.online`
- `www.spudchallenge.online` redirects to the apex

## Current status (verified live, 2026-08-25)

| Check | Result |
| --- | --- |
| GitHub Actions deploy | Succeeds on every push to `main`; the temporary `https://oaqwoods.github.io/SpudChallenge/` URL 301-redirects to the apex (expected once a custom domain is configured) |
| Apex | `https://spudchallenge.online/` serves 200 over HTTPS; all 20 exported routes return 200 |
| www | `https://www.spudchallenge.online/` 301-redirects to the apex |
| HTTPS | Certificate `CN=spudchallenge.online`, valid (issued 2026-08-24, expires 2026-11-22 — GitHub auto-renews); Enforce HTTPS on |
| No `/SpudChallenge` dependency | No `basePath`/`assetPrefix`; canonical/OG/sitemap target the apex |
| Bundle secrets | None — deployed chunks scanned; only the public anon JWT is embedded |
| CORS | Preflight from the apex gets `access-control-allow-origin: https://spudchallenge.online`; a foreign origin gets a non-matching fixed header on preflight and **403** on the actual POST |
| Email links | Resend confirmation/unsubscribe/trade emails build links from `PUBLIC_SITE_URL` (`https://spudchallenge.online`) |

## Part A — pre-DNS verification (done before any DNS change)

- [x] GitHub Pages Actions deployment succeeds at the temporary Pages URL.
- [x] Production static export has no `/SpudChallenge` dependency
      (`next.config.ts` has no `basePath`; `npm run build` emits `out/` with
      `CNAME`, `404.html`, `sitemap.xml`, `robots.txt`).
- [x] All production absolute URLs use `https://spudchallenge.online`
      (metadata, sitemap, canonical, OG, share links, email links).
- [x] No secrets in the frontend bundle (`.env.example` holds only
      `NEXT_PUBLIC_*` values; service-role/Resend keys live only as Edge
      Function secrets; guard test + deployed-bundle scan).
- [x] Supabase Auth redirect URLs and Edge Function CORS ready for the
      production domain (CORS allowlist contains the apex; Auth redirect
      configured in the dashboard — see Part B item 5 for the value to
      confirm).
- [x] Resend/email links are production-domain aware.

## Part B — manual owner checklist

### 1. GitHub repository → Settings → Pages

- Source: **GitHub Actions** (the workflow's `configure-pages` step enables
  it automatically on first run).
- Custom domain: enter `spudchallenge.online` → Save. The repository also
  ships `public/CNAME` with the same hostname; with the Actions source the
  Pages setting is authoritative.

### 2. Spaceship DNS records (GitHub's current official values)

In Spaceship's DNS manager for `spudchallenge.online`, replacing any
conflicting records (parking/defaults) for the same hosts:

| Type | Host | Value | Purpose |
| --- | --- | --- | --- |
| A | `@` | `185.199.108.153` | Apex → GitHub Pages |
| A | `@` | `185.199.109.153` | Apex → GitHub Pages |
| A | `@` | `185.199.110.153` | Apex → GitHub Pages |
| A | `@` | `185.199.111.153` | Apex → GitHub Pages |
| CNAME | `www` | `oaqwoods.github.io` | www → Pages (no repository name in the target) |

Optional IPv6 (AAAA at `@`): `2606:50c0:8000::153`, `2606:50c0:8001::153`,
`2606:50c0:8002::153`, `2606:50c0:8003::153`.

Values confirmed against GitHub's official "Managing a custom domain"
documentation on 2026-08-25. Re-check that page before editing if a long
time has passed.

### 3. Optional `www` record/redirect

The `www` CNAME above is all that is needed: GitHub Pages serves the site
for the verified custom domain and 301-redirects `www` to the apex. Do not
point `www` at the apex with an ALIAS/ANAME record — the official docs warn
that can break HTTPS enforcement.

### 4. GitHub DNS verification

Settings → Pages shows an account-specific verification TXT record when the
custom domain is added. Add it at Spaceship exactly as shown; it prevents
domain-takeover by other GitHub accounts.

### 5. HTTPS certificate + Enforce HTTPS

- Tick **Enforce HTTPS** in Settings → Pages. The option can take up to 24 h
  to appear while GitHub provisions the certificate; retry later if greyed
  out.
- Confirm the served certificate covers `spudchallenge.online` (GitHub
  auto-renews ~90-day certificates).
- In Supabase → Authentication → URL Configuration: Site URL
  `https://spudchallenge.online`; allowed redirects include
  `https://spudchallenge.online/admin/reset-password` (exact value, no
  trailing slash — used as the recovery `redirectTo`).

### 6. Final verification of `https://spudchallenge.online`

- Loads over HTTPS with the retro landing page; countdown/current value
  render; admin login reachable at `/admin/login/`.
- `dig +short spudchallenge.online A` → the four GitHub IPs above.
- Spot-check deep links: `/offer/`, `/rules/`, `/terms/`, `/privacy/`,
  `/unsubscribe/`, `/sitemap.xml`, `/robots.txt`, `/og/challenge.png`.

### 7. Final verification of the www redirect

- `https://www.spudchallenge.online/` → 301 → `https://spudchallenge.online/`
  (browser and `curl -sI`).
- `dig +short www.spudchallenge.online CNAME` → `oaqwoods.github.io`.

### 8. Sitemap / canonical / OG / email / Auth / CORS checks

- `view-source` on the homepage: `rel="canonical"`, `og:url`, `og:image`
  all on the apex; `robots.txt` lists the apex sitemap.
- Share buttons and confirmation/unsubscribe/trade emails contain
  `https://spudchallenge.online` links only.
- CORS: a preflight with `Origin: https://spudchallenge.online` returns
  `access-control-allow-origin: https://spudchallenge.online`; any other
  origin is refused (403 on the actual request).
- Supabase Auth recovery flow completes at
  `/admin/reset-password/` from the emailed link.

## Operational notes

- Edge Functions require the anon key (`Authorization: Bearer …`) — a
  request without it gets `401 UNAUTHORIZED_NO_AUTH_HEADER` from the
  platform before function code runs; the browser client always sends it.
  Origin enforcement (403) happens in function code afterwards.
- DNS changes are always manual owner actions; nothing in this repository
  mutates DNS, and CI never touches Spaceship.
