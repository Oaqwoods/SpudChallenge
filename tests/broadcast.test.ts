import test from "node:test";
import assert from "node:assert/strict";
import {
  AUDIENCE_LABELS,
  buildTradeEmail,
  escapeHtml,
  formatUsdForEmail,
  timeRemainingLabel,
  type TradeEmailInput,
} from "../lib/broadcast.ts";
import {
  MAX_BATCH_SIZE,
  chunk,
  resolveAudience,
  type AudienceRow,
} from "../supabase/functions/_shared/broadcast.ts";

function emailInput(overrides: Partial<TradeEmailInput> = {}): TradeEmailInput {
  return {
    tradeNumber: 5,
    outgoingItem: "Bike",
    outgoingValue: 850,
    incomingItem: "Watch",
    incomingValue: 1400,
    startingValue: 1,
    currentValue: 1400,
    timeRemainingLabel: "12d 04h 33m left on the 21-day clock",
    story: "Great trade & fun",
    imageUrl: null,
    siteUrl: "https://spudchallenge.online",
    ...overrides,
  };
}

test("escapeHtml neutralizes markup", () => {
  assert.equal(
    escapeHtml(`<img src=x onerror="alert('hi')">`),
    "&lt;img src=x onerror=&quot;alert(&#39;hi&#39;)&quot;&gt;",
  );
  assert.equal(escapeHtml("a & b"), "a &amp; b");
});

test("formatUsdForEmail renders whole-dollar amounts", () => {
  assert.equal(formatUsdForEmail(850), "$850");
  assert.equal(formatUsdForEmail(1400), "$1,400");
});

test("timeRemainingLabel handles missing, past and future end times", () => {
  assert.equal(timeRemainingLabel(null, 0), null);
  assert.equal(timeRemainingLabel("not-a-date", 0), null);
  assert.equal(
    timeRemainingLabel("2026-08-20T00:00:00Z", Date.parse("2026-08-21T00:00:00Z")),
    "The 21-day clock just hit zero",
  );
  const label = timeRemainingLabel(
    "2026-08-21T05:06:07Z",
    Date.parse("2026-08-20T00:00:00Z"),
  );
  assert.equal(label, "1d 05h 06m left on the 21-day clock");
});

test("buildTradeEmail matches the suggested subject and escapes content", () => {
  const draft = buildTradeEmail(
    emailInput({ outgoingItem: "Bike <script>", incomingItem: "Watch & Co" }),
  );
  assert.equal(draft.subject, "TRADE #5: $850 → $1,400");
  assert.ok(draft.body_html.includes("TRADE #5 COMPLETE"));
  assert.ok(draft.body_html.includes("Bike &lt;script&gt;"));
  assert.ok(!draft.body_html.includes("<script>"));
  assert.ok(draft.body_html.includes("Watch &amp; Co"));
  assert.ok(draft.body_html.includes("Great trade &amp; fun"));
});

test("buildTradeEmail carries the retention block and both CTAs", () => {
  const draft = buildTradeEmail(emailInput());
  // Template data: current multiplier, time remaining, challenge link.
  assert.ok(draft.body_html.includes("×1,400 the $1 start"));
  assert.ok(draft.body_html.includes("12d 04h 33m left on the 21-day clock"));
  assert.ok(draft.body_html.includes("https://spudchallenge.online"));
  // Primary CTA links to the offer form; secondary asks for a forward.
  assert.ok(draft.body_html.includes("https://spudchallenge.online/offer/"));
  assert.ok(draft.body_html.toLowerCase().includes("have something better?"));
  assert.ok(draft.body_html.toLowerCase().includes("forward this to someone who does"));
});

test("buildTradeEmail includes the current-item image only when provided", () => {
  const withImage = buildTradeEmail(
    emailInput({ imageUrl: "https://cdn.example/item.jpg" }),
  );
  assert.ok(withImage.body_html.includes('<img src="https://cdn.example/item.jpg"'));
  const without = buildTradeEmail(emailInput({ imageUrl: null }));
  assert.ok(!without.body_html.includes("<img"));
});

test("buildTradeEmail omits an empty story and empty time label", () => {
  const draft = buildTradeEmail(
    emailInput({ story: "   ", timeRemainingLabel: null }),
  );
  assert.ok(!draft.body_html.includes("<p></p>"));
  assert.ok(!draft.body_html.includes("left on the 21-day clock"));
});

test("audience labels exist for every stored audience type", () => {
  assert.ok(AUDIENCE_LABELS.ongoing_followers);
  assert.ok(AUDIENCE_LABELS.trade_interest);
  assert.ok(AUDIENCE_LABELS.all);
});

function follower(overrides: Partial<AudienceRow> = {}): AudienceRow {
  return {
    email: "follower@example.com",
    email_updates_opt_in: true,
    email_updates_unsubscribed_at: null,
    trade_interest: false,
    ...overrides,
  };
}

test("resolveAudience keeps only opted-in followers for ongoing broadcasts", () => {
  const rows = [
    follower({ email: "in@example.com" }),
    follower({ email: "interest-only@example.com", email_updates_opt_in: false, trade_interest: true }),
    follower({ email: "out@example.com", email_updates_opt_in: false, trade_interest: false }),
  ];
  assert.deepEqual(resolveAudience(rows, "ongoing_followers"), ["in@example.com"]);
});

test("resolveAudience never includes unsubscribed addresses", () => {
  const rows = [
    follower({ email: "gone@example.com", email_updates_unsubscribed_at: "2026-08-01T00:00:00Z" }),
    follower({
      email: "gone2@example.com",
      email_updates_opt_in: false,
      trade_interest: true,
      email_updates_unsubscribed_at: "2026-08-02T00:00:00Z",
    }),
    follower({ email: "still-here@example.com", trade_interest: true }),
  ];
  assert.deepEqual(resolveAudience(rows, "ongoing_followers"), ["still-here@example.com"]);
  assert.deepEqual(resolveAudience(rows, "trade_interest"), ["still-here@example.com"]);
  assert.deepEqual(resolveAudience(rows, "all"), ["still-here@example.com"]);
});

test("resolveAudience segments trade interest and unions 'all', deduplicated", () => {
  const rows = [
    follower({ email: "A@Example.com" }),
    follower({ email: "a@example.com", trade_interest: true }),
    follower({ email: "trader@example.com", email_updates_opt_in: false, trade_interest: true }),
    follower({ email: "  spaced@example.com  ", trade_interest: true }),
  ];
  assert.deepEqual(resolveAudience(rows, "ongoing_followers"), [
    "a@example.com",
    "spaced@example.com",
  ]);
  assert.deepEqual(resolveAudience(rows, "trade_interest"), [
    "a@example.com",
    "trader@example.com",
    "spaced@example.com",
  ]);
  assert.deepEqual(resolveAudience(rows, "all"), [
    "a@example.com",
    "trader@example.com",
    "spaced@example.com",
  ]);
});

test("chunk splits into Resend-sized batches", () => {
  assert.equal(MAX_BATCH_SIZE, 100);
  const items = Array.from({ length: 250 }, (_, i) => i);
  const groups = chunk(items, MAX_BATCH_SIZE);
  assert.deepEqual(groups.map((g) => g.length), [100, 100, 50]);
  assert.deepEqual(chunk([], MAX_BATCH_SIZE), []);
  assert.throws(() => chunk(items, 0));
});
