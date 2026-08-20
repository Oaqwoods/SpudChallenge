import test from "node:test";
import assert from "node:assert/strict";
import {
  buildShareText,
  buildShareTitle,
  emailShareUrl,
  facebookShareUrl,
  redditShareUrl,
  xShareUrl,
  type ShareState,
} from "../lib/share.ts";

function state(overrides: Partial<ShareState> = {}): ShareState {
  return {
    phase: "active",
    currentItemName: "Watch",
    currentValue: 1400,
    startingValue: 1,
    targetValue: 5_000_000,
    tradeNumber: 5,
    timeRemainingLabel: "12d 04h 33m",
    ...overrides,
  };
}

test("buildShareTitle leads with the challenge framing prelaunch, trade number when active", () => {
  assert.equal(
    buildShareTitle(state({ phase: "prelaunch" })),
    "ONE → FIVE: $1 → $5,000,000 in 21 days",
  );
  assert.equal(
    buildShareTitle(state()),
    "Trade #5: now holding Watch ($1,400)",
  );
});

test("buildShareText emphasizes goal, current item/value, trade number and time left", () => {
  const text = buildShareText(state());
  assert.ok(text.includes("$1 → $5,000,000 in 21 days"));
  assert.ok(text.includes("Trade #5"));
  assert.ok(text.includes("Watch"));
  assert.ok(text.includes("$1,400"));
  assert.ok(text.includes("12d 04h 33m"));
});

test("buildShareText handles prelaunch and complete phases", () => {
  const prelaunch = buildShareText(state({ phase: "prelaunch" }));
  assert.ok(prelaunch.includes("ONE → FIVE"));
  assert.ok(!prelaunch.includes("Trade #"));

  const complete = buildShareText(state({ phase: "complete", timeRemainingLabel: null }));
  assert.ok(complete.includes("complete"));
  assert.ok(complete.includes("after 5 trades"));
});

test("buildShareText falls back to TBA without a clock", () => {
  const text = buildShareText(state({ timeRemainingLabel: null }));
  assert.ok(text.includes("Time remaining: TBA"));
});

test("share intent URLs encode text and target the right endpoints", () => {
  const url = "https://spudchallenge.online";
  const text = "Trade #5: $850 → $1,400";

  const x = xShareUrl(url, text);
  assert.ok(x.startsWith("https://x.com/intent/tweet?"));
  assert.ok(x.includes(`text=${encodeURIComponent(text)}`));
  assert.ok(x.includes(`url=${encodeURIComponent(url)}`));

  const facebook = facebookShareUrl(url);
  assert.ok(facebook.startsWith("https://www.facebook.com/sharer/sharer.php?u="));

  const reddit = redditShareUrl(url, "A title & more");
  assert.ok(reddit.startsWith("https://www.reddit.com/submit?"));
  assert.ok(reddit.includes(`title=${encodeURIComponent("A title & more")}`));
});

test("emailShareUrl builds a mailto with subject and body including the link", () => {
  const mailto = emailShareUrl("https://spudchallenge.online", "Subject line", "Body text");
  assert.ok(mailto.startsWith("mailto:?subject="));
  assert.ok(mailto.includes(encodeURIComponent("Subject line")));
  const body = decodeURIComponent(mailto.split("&body=")[1]);
  assert.ok(body.includes("Body text"));
  assert.ok(body.includes("https://spudchallenge.online"));
});
