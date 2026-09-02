# Meta Creative Test 01 — Spud Challenge

Static ad creative package for the first Meta creative test: two concepts,
three aspect ratios each. Built from the site's existing brand system —
retro console palette (`app/globals.css`), the original pixel potato mascot
(`components/spud-mascot.tsx`), and the Press Start 2P display face
(SIL OFL, bundled in `fonts/` with its license). No Nintendo-owned or other
third-party characters, logos or artwork.

`.svg` files are the editable sources (1:1 pixel coordinates, commented);
`.png` files are the final exports rendered from them.

## Concepts

### Ad A — Impossible + Curiosity (`ad-a-impossible/`)

Makes a viewer wonder whether this is actually possible. A personal,
documented barter challenge — not a claim that viewers can earn money.

| Placement | File | Dimensions |
| --- | --- | --- |
| Feed | `feed-1080x1350.svg` / `.png` | 1080×1350 (4:5) |
| Stories / Reels | `story-1080x1920.svg` / `.png` | 1080×1920 (9:16) |
| Square fallback | `square-1080x1080.svg` / `.png` | 1080×1080 (1:1) |

Meta copy:

- **Primary text:** I'm starting with $1 and trying to trade it into
  $5,000,000 in 21 days. No buying. No adding cash. Only trades. How far
  can $1 actually go?
- **Headline:** Can $1 Become $5 Million?
- **Description:** 21 days. Only trades.
- **CTA:** Learn More

On-image text: `A TRADE CHALLENGE BY SPUD` kicker, Spud mascot, `$1` →
`$5,000,000?`, `21 DAYS.` / `ONLY TRADES.`, `SPUDCHALLENGE.ONLINE` footer.

### Ad B — Participation (`ad-b-participation/`)

Makes the viewer think about what *they* might trade.

| Placement | File | Dimensions |
| --- | --- | --- |
| Feed | `feed-1080x1350.svg` / `.png` | 1080×1350 (4:5) |
| Stories / Reels | `story-1080x1920.svg` / `.png` | 1080×1920 (9:16) |
| Square fallback | `square-1080x1080.svg` / `.png` | 1080×1080 (1:1) |

Meta copy:

- **Primary text:** I'm starting with $1. Think you have something better?
  Trade #1 offers are open now. One item at a time. No buying. Only trades.
- **Headline:** Think You Have Something Better?
- **Description:** Trade #1 starts with $1.
- **CTA:** Learn More

On-image text: kicker, mascot, `I HAVE $1.` / `THINK YOU HAVE` /
`SOMETHING BETTER?`, `▶ TRADE #1 OFFERS ARE OPEN` status chip, footer.

## Design notes

- Palette: background `#0a0a0f`, panel `#13131c`, edge `#2b2b3a`, accent
  `#ffd23f` (with the site's pixel glow), mint `#35d07f`, foreground
  `#ece9e2`, faded `#8b8b9e` — identical to `app/globals.css`.
- Retro details: hard black offset shadow on the status chip, console-bezel
  frame, subtle CRT scanline overlay, chunky pixel arrows/triangle drawn on
  the same grid language as the mascot.
- Safe areas: feed/square keep all content ≥60px inside the frame; stories
  keep all content inside y≈300–1560 so Meta/Instagram UI chrome (profile
  header top, reply bar and CTA bottom) never covers the message.
- Hierarchy: one-second read — mascot + `$1`/`$5,000,000?` (Ad A) or
  `I HAVE $1.` (Ad B) dominate; everything else is secondary.

## Regenerating PNGs from the SVG sources

The SVGs use `font-family="Press Start 2P"`; install `fonts/PressStart2P-Regular.ttf`
(or point a renderer at it) before exporting. Any SVG→PNG renderer that
honours embedded/system fonts and `shape-rendering="crispEdges"` works; the
originals were rendered with `@resvg/resvg-js`:

```bash
npm install @resvg/resvg-js   # in a scratch dir, not this repo
node -e '
const { Resvg } = require("@resvg/resvg-js");
const fs = require("fs");
const font = "<path to this package>/fonts/PressStart2P-Regular.ttf";
for (const f of process.argv.slice(1)) {
  const svg = fs.readFileSync(f, "utf8");
  const r = new Resvg(svg, { font: { loadSystemFonts: false, fontFiles: [font], defaultFontFamily: "Press Start 2P" } });
  fs.writeFileSync(f.replace(/\.svg$/, ".png"), r.render().asPng());
}
' ad-a-impossible/feed-1080x1350.svg # …etc
```

Exports were validated: correct PNG signature and exact pixel dimensions
(1080×1350 / 1080×1920 / 1080×1080), no element crosses the bezel frame.

## Fonts

`fonts/PressStart2P-Regular.ttf` — Press Start 2P by The Press Start 2P
Project Authors, SIL Open Font License 1.1 (see `fonts/OFL.txt`).
