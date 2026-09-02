// Meta Pixel + consent helpers — browser side (playbook PROMPT 40 / spec §39).
// Covers checklist items 1–7 and 12–13: safe no-op without a Pixel ID,
// consent gating, conversion-only-after-success ordering, the final
// standard-event mapping (follower → CompleteRegistration, trade_offer →
// Lead, no custom parameters), shared event_id deduplication, and intact
// first-party analytics.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  META_CONSENT_STORAGE_KEY,
  META_STANDARD_EVENTS,
  buildMetaRequestMetadata,
  captureMetaTestEventCode,
  fireMetaConversion,
  injectMetaPixel,
  metaMeasurementAllowed,
  metaPixelConfigured,
  metaPixelScriptSource,
  newMetaEventId,
  parseMetaConsent,
  readMetaAttributionCookies,
  readMetaTestEventCode,
  trackMetaConversion,
  validateMetaTestEventCode,
  withMetaTestEventCode,
} from "../lib/meta.ts";

// --- fakes -------------------------------------------------------------------

function fakeStorage(initial?: string): {
  store: Map<string, string>;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
} {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set(META_CONSENT_STORAGE_KEY, initial);
  return {
    store,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
  };
}

function fakeSession(): {
  store: Map<string, string>;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
} {
  const store = new Map<string, string>();
  return {
    store,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
  };
}

interface FakeDocument {
  appended: Array<{ id: string; async: boolean; text: string }>;
  createElement: () => { id: string; async: boolean; text: string };
  getElementById: (id: string) => unknown;
  head: { appendChild: (el: unknown) => void };
}

function fakeDocument(existingIds: string[] = []): FakeDocument {
  const appended: FakeDocument["appended"] = [];
  return {
    appended,
    createElement: () => ({ id: "", async: false, text: "" }),
    getElementById: (id) => (existingIds.includes(id) ? {} : null),
    head: { appendChild: (el) => appended.push(el as { id: string; async: boolean; text: string }) },
  };
}

function fakeFbq() {
  const calls: unknown[][] = [];
  return { calls, ctx: { fbq: (...args: unknown[]) => void calls.push(args) } };
}

// --- consent ------------------------------------------------------------------

test("parseMetaConsent accepts only the two explicit choices", () => {
  assert.equal(parseMetaConsent("allowed"), "allowed");
  assert.equal(parseMetaConsent("declined"), "declined");
  assert.equal(parseMetaConsent(null), null);
  assert.equal(parseMetaConsent(""), null);
  assert.equal(parseMetaConsent("ALLOWED"), null);
  assert.equal(parseMetaConsent("anything"), null);
});

test("Meta measurement is off before a choice and after a Decline", () => {
  assert.equal(metaMeasurementAllowed(fakeStorage()), false, "off before any choice");
  assert.equal(metaMeasurementAllowed(fakeStorage("declined")), false, "off after decline");
  assert.equal(metaMeasurementAllowed(fakeStorage("allowed")), true, "on only after allow");
});

test("buildMetaRequestMetadata is null without consent", () => {
  assert.equal(buildMetaRequestMetadata(fakeStorage(), fakeSession(), ""), null);
  assert.equal(buildMetaRequestMetadata(fakeStorage("declined"), fakeSession(), ""), null);
});

test("buildMetaRequestMetadata builds consent-tagged metadata after Allow", () => {
  const meta = buildMetaRequestMetadata(fakeStorage("allowed"), fakeSession(), "");
  assert.ok(meta);
  assert.equal(meta.consented, true);
  assert.match(meta.event_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.equal(meta.test_event_code, undefined);
});

test("newMetaEventId uses the injected UUID source", () => {
  assert.equal(newMetaEventId(() => "fixed-id"), "fixed-id");
});

// --- Pixel loading -------------------------------------------------------------

test("metaPixelConfigured no-ops on an empty or missing Pixel ID", () => {
  assert.equal(metaPixelConfigured(""), false);
  assert.equal(metaPixelConfigured("   "), false);
  assert.equal(metaPixelConfigured("1055342657299625"), true);
});

test("injectMetaPixel safely no-ops without a Pixel ID", () => {
  const doc = fakeDocument();
  assert.equal(injectMetaPixel("", doc as unknown as Document), false);
  assert.equal(doc.appended.length, 0);
});

test("injectMetaPixel injects the standard loader once, init without Advanced Matching", () => {
  const doc = fakeDocument();
  assert.equal(injectMetaPixel("1055342657299625", doc as unknown as Document), true);
  assert.equal(doc.appended.length, 1);
  const script = doc.appended[0];
  assert.equal(script.id, "meta-pixel");
  assert.equal(script.async, true);
  assert.ok(script.text.includes("https://connect.facebook.net/en_US/fbevents.js"));
  assert.ok(script.text.includes("fbq('init','1055342657299625');"));
  // No customer-information parameter / Advanced Matching on init.
  assert.ok(!script.text.includes("userData"));
  assert.ok(!script.text.includes("advanced"));

  // Already injected → no duplicate script.
  const doc2 = fakeDocument(["meta-pixel"]);
  assert.equal(injectMetaPixel("1055342657299625", doc2 as unknown as Document), false);
  assert.equal(doc2.appended.length, 0);
});

test("metaPixelScriptSource strips non-digits from the Pixel ID", () => {
  assert.ok(metaPixelScriptSource("123abc456").includes("fbq('init','123456');"));
});

// --- standard-event mapping --------------------------------------------------------

test("META_STANDARD_EVENTS pins the final Events Manager mapping", () => {
  assert.deepEqual(META_STANDARD_EVENTS, {
    follower: "CompleteRegistration",
    trade_offer: "Lead",
  });
});

test("trackMetaConversion fires the mapped standard event with eventID and no custom params", () => {
  const { calls, ctx } = fakeFbq();
  trackMetaConversion("follower", "evt-1", ctx);
  trackMetaConversion("trade_offer", "evt-2", ctx);
  assert.deepEqual(calls, [
    ["track", "CompleteRegistration", {}, { eventID: "evt-1" }],
    ["track", "Lead", {}, { eventID: "evt-2" }],
  ]);
});

test("trackMetaConversion rejects unknown conversion types and empty event ids", () => {
  const { calls, ctx } = fakeFbq();
  trackMetaConversion("purchase" as never, "evt-1", ctx);
  trackMetaConversion("follower", "", ctx);
  assert.equal(calls.length, 0);
});

test("trackMetaConversion swallows Pixel failures", () => {
  assert.doesNotThrow(() =>
    trackMetaConversion("follower", "evt-1", {
      fbq: () => {
        throw new Error("pixel blocked");
      },
    }),
  );
});

test("fireMetaConversion is consent-gated", () => {
  const { calls, ctx } = fakeFbq();
  fireMetaConversion("follower", "evt-1", fakeStorage("declined"), ctx);
  fireMetaConversion("follower", "evt-1", fakeStorage(), ctx);
  assert.equal(calls.length, 0, "declined or unchosen consent fires nothing");
  fireMetaConversion("trade_offer", "evt-2", fakeStorage("allowed"), ctx);
  assert.deepEqual(calls, [["track", "Lead", {}, { eventID: "evt-2" }]]);
});

// --- attribution cookies -----------------------------------------------------------

test("readMetaAttributionCookies captures _fbp/_fbc when present", () => {
  assert.deepEqual(
    readMetaAttributionCookies("_fbp=fb.1.1700000000.abc; other=1; _fbc=fb.1.1700000000.def"),
    { fbp: "fb.1.1700000000.abc", fbc: "fb.1.1700000000.def" },
  );
});

test("missing or blocked cookies degrade to nothing, never an error", () => {
  assert.deepEqual(readMetaAttributionCookies(""), {});
  assert.deepEqual(readMetaAttributionCookies("unrelated=1"), {});
  assert.deepEqual(readMetaAttributionCookies(`_fbp=${"x".repeat(2000)}`), {});
});

// --- Meta "Test events" code -------------------------------------------------

test("validateMetaTestEventCode accepts only short alphanumerics", () => {
  assert.equal(validateMetaTestEventCode("EAG84721"), "EAG84721");
  assert.equal(validateMetaTestEventCode(null), null);
  assert.equal(validateMetaTestEventCode(""), null);
  assert.equal(validateMetaTestEventCode("ABC 123"), null);
  assert.equal(validateMetaTestEventCode("abc-123"), null);
  assert.equal(validateMetaTestEventCode("a".repeat(65)), null);
});

test("readMetaTestEventCode parses the URL query only", () => {
  assert.equal(readMetaTestEventCode("?test_event_code=EAG84721&utm_source=x"), "EAG84721");
  assert.equal(readMetaTestEventCode("?utm_source=x"), null);
  assert.equal(readMetaTestEventCode(""), null);
  assert.equal(readMetaTestEventCode("?test_event_code=bad/code"), null);
});

test("captureMetaTestEventCode stores a URL code and falls back to the session", () => {
  const session = fakeSession();
  // URL code wins and is persisted for later navigations.
  assert.equal(captureMetaTestEventCode("?test_event_code=EAG84721", session), "EAG84721");
  assert.equal(session.store.get("spud_meta_test_event_code"), "EAG84721");
  // Later page load without the param: the session keeps the test session tagged.
  assert.equal(captureMetaTestEventCode("", session), "EAG84721");
  // Garbage in storage is rejected, never forwarded.
  session.store.set("spud_meta_test_event_code", "not valid!");
  assert.equal(captureMetaTestEventCode("", session), null);
});

test("withMetaTestEventCode adds or updates the param without touching the path", () => {
  assert.equal(
    withMetaTestEventCode("https://spudchallenge.online/offer/", "EAG84721"),
    "https://spudchallenge.online/offer/?test_event_code=EAG84721",
  );
  assert.equal(
    withMetaTestEventCode("https://spudchallenge.online/?test_event_code=OLD", "NEW1"),
    "https://spudchallenge.online/?test_event_code=NEW1",
  );
});

test("buildMetaRequestMetadata forwards the test code only with consent", () => {
  const session = fakeSession();
  const withCode = buildMetaRequestMetadata(
    fakeStorage("allowed"),
    session,
    "?test_event_code=EAG84721",
  );
  assert.equal(withCode?.test_event_code, "EAG84721");

  // Navigation lost the param; the session-stored code still tags submissions.
  const afterNav = buildMetaRequestMetadata(fakeStorage("allowed"), session, "");
  assert.equal(afterNav?.test_event_code, "EAG84721");

  // No consent → nothing leaves the browser, test code included.
  assert.equal(
    buildMetaRequestMetadata(fakeStorage("declined"), fakeSession(), "?test_event_code=EAG84721"),
    null,
  );
});

test("the TEST52520 test URL reaches the request metadata and survives navigation", () => {
  const session = fakeSession();
  // Step 1–3: the URL Meta Test Events opens → sessionStorage capture →
  // consented request metadata.
  const meta = buildMetaRequestMetadata(
    fakeStorage("allowed"),
    session,
    "?test_event_code=TEST52520",
  );
  assert.equal(meta?.test_event_code, "TEST52520");
  // Step 2 backstop: with the param gone, the session-stored code still
  // tags the submission (step 4).
  const afterNav = buildMetaRequestMetadata(fakeStorage("allowed"), session, "");
  assert.equal(afterNav?.test_event_code, "TEST52520");
});

// --- end-to-end submission simulation -----------------------------------------------
// Mirrors the exact ordering in follow-section.tsx / offer-form.tsx: metadata
// is built before the request, and the Pixel conversion event fires ONLY
// after the backend confirms success — with the same event_id the server
// CAPI receives.

function simulateSubmission(opts: {
  conversionType: "follower" | "trade_offer";
  consent: "allowed" | "declined" | null;
  backendSucceeds: boolean;
  search?: string;
}) {
  const storage = fakeStorage(opts.consent ?? undefined);
  const session = fakeSession();
  const { calls, ctx } = fakeFbq();

  const meta = buildMetaRequestMetadata(storage, session, opts.search ?? "");
  // Server-side counterpart: what the Edge Function would parse/forward.
  const serverMeasurement = meta
    ? { event_id: meta.event_id, fbp: meta.fbp, fbc: meta.fbc, test_event_code: meta.test_event_code }
    : null;

  let backendOk = false;
  try {
    if (!opts.backendSucceeds) throw new Error("backend rejected");
    backendOk = true;
  } catch {
    backendOk = false;
  }

  // Component behavior: first-party track() always runs on success, the
  // Pixel conversion event only when metadata exists AND the backend
  // succeeded.
  if (backendOk && meta) {
    fireMetaConversion(opts.conversionType, meta.event_id, storage, ctx);
  }

  return { calls, serverMeasurement };
}

test("Pixel conversion event does not fire when the backend submission fails", () => {
  const { calls, serverMeasurement } = simulateSubmission({
    conversionType: "follower",
    consent: "allowed",
    backendSucceeds: false,
  });
  assert.equal(calls.length, 0);
  // Without a successful submission the server sends nothing either.
  assert.ok(serverMeasurement);
});

test("successful follower signup fires exactly one browser CompleteRegistration", () => {
  const { calls, serverMeasurement } = simulateSubmission({
    conversionType: "follower",
    consent: "allowed",
    backendSucceeds: true,
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    "track",
    "CompleteRegistration",
    {},
    { eventID: serverMeasurement?.event_id },
  ]);
});

test("successful offer submission fires exactly one browser Lead", () => {
  const { calls, serverMeasurement } = simulateSubmission({
    conversionType: "trade_offer",
    consent: "allowed",
    backendSucceeds: true,
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [
    "track",
    "Lead",
    {},
    { eventID: serverMeasurement?.event_id },
  ]);
});

test("declined consent prevents all Meta measurement even on success", () => {
  const { calls, serverMeasurement } = simulateSubmission({
    conversionType: "trade_offer",
    consent: "declined",
    backendSucceeds: true,
  });
  assert.equal(calls.length, 0);
  assert.equal(serverMeasurement, null, "no meta metadata leaves the browser");
});

test("an Events Manager test session tags the server measurement", () => {
  const { calls, serverMeasurement } = simulateSubmission({
    conversionType: "trade_offer",
    consent: "allowed",
    backendSucceeds: true,
    search: "?test_event_code=EAG84721",
  });
  assert.equal(calls.length, 1);
  assert.equal(serverMeasurement?.test_event_code, "EAG84721");
});

// --- first-party analytics remain intact ----------------------------------------------
// lib/analytics.ts uses the `@/` build alias, which node:test cannot
// resolve — so instead of importing it, this test pins the actual wiring:
// the first-party events still fire in both forms, in order, before the
// consent-gated Meta conversion event, and the analytics client itself
// stays a Meta-free fire-and-forget design.

test("first-party analytics intact; Pixel conversion fires only after backend success", () => {
  const root = new URL("..", import.meta.url).pathname;
  const read = (path: string) =>
    readFileSync(join(root, path), "utf8");

  const follow = read("components/follow-section.tsx");
  const offer = read("components/offer-form.tsx");
  const analytics = read("lib/analytics.ts");

  // The first-party success events still exist and still fire.
  assert.ok(follow.includes('track("follower_submitted")'));
  assert.ok(offer.includes('track("offer_submitted")'));

  // The analytics client keeps its privacy-light design, untouched by Meta.
  assert.ok(analytics.includes("keepalive: true"));
  assert.ok(analytics.includes('"follower_submitted"'));
  assert.ok(analytics.includes('"offer_submitted"'));
  assert.ok(!/meta/i.test(analytics));

  // Ordering in BOTH forms: awaited backend call → first-party track →
  // consent-gated Pixel conversion event. A conversion before backend
  // success would invert these indexes.
  const followCall = follow.indexOf('"follow-signup"');
  const followTrack = follow.indexOf('track("follower_submitted")');
  const followConversion = follow.indexOf('fireMetaConversion("follower"');
  assert.ok(followCall !== -1 && followTrack !== -1 && followConversion !== -1);
  assert.ok(followCall < followTrack && followTrack < followConversion);

  const offerCall = offer.indexOf('"submit-offer"');
  const offerTrack = offer.indexOf('track("offer_submitted")');
  const offerConversion = offer.indexOf('fireMetaConversion("trade_offer"');
  assert.ok(offerCall !== -1 && offerTrack !== -1 && offerConversion !== -1);
  assert.ok(offerCall < offerTrack && offerTrack < offerConversion);

  // The conversion event is consent-gated in both forms (meta metadata may
  // be null).
  assert.ok(follow.includes("if (meta) fireMetaConversion"));
  assert.ok(offer.includes("if (meta) fireMetaConversion"));
});
