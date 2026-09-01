// Meta Conversions API helpers — server side (playbook PROMPT 40 / spec §39).
// Covers checklist items 7–11: approved-fields-only payload, no PII,
// optional fbp/fbc, failure isolation, shared event_id deduplication.

import test from "node:test";
import assert from "node:assert/strict";
import {
  META_GRAPH_VERSION,
  buildMetaLeadEvent,
  metaCapiConfig,
  metaEventsUrl,
  parseMetaMeasurement,
  recordMetaLeadBestEffort,
  sendMetaLead,
  type MetaLeadInput,
} from "../supabase/functions/_shared/meta-capi.ts";

const FULL_INPUT: MetaLeadInput = {
  conversionType: "follower",
  eventId: "3f2c9a4e-9b1d-4e6a-8f0c-1a2b3c4d5e6f",
  eventSourceUrl: "https://spudchallenge.online/",
  clientIpAddress: "203.0.113.7",
  clientUserAgent: "TestAgent/1.0",
  fbp: "fb.1.1700000000000.abcdef",
  fbc: "fb.1.1700000000000.fbclid",
};

// --- configuration ---------------------------------------------------------

test("metaCapiConfig requires both secrets and trims them", () => {
  assert.equal(metaCapiConfig(() => undefined), null);
  assert.equal(metaCapiConfig((k) => (k === "META_CAPI_ACCESS_TOKEN" ? "tok" : undefined)), null);
  assert.equal(metaCapiConfig((k) => (k === "META_DATASET_ID" ? "123" : undefined)), null);
  assert.deepEqual(
    metaCapiConfig((k) => (k === "META_CAPI_ACCESS_TOKEN" ? " tok " : " 456 ")),
    { accessToken: "tok", datasetId: "456" },
  );
});

test("metaEventsUrl pins the documented Graph API version", () => {
  assert.equal(META_GRAPH_VERSION, "v25.0");
  assert.equal(metaEventsUrl("123"), "https://graph.facebook.com/v25.0/123/events");
});

// --- consent-gated request metadata -----------------------------------------

test("parseMetaMeasurement requires consented === true", () => {
  assert.equal(parseMetaMeasurement(undefined), null);
  assert.equal(parseMetaMeasurement(null), null);
  assert.equal(parseMetaMeasurement("meta"), null);
  assert.equal(parseMetaMeasurement([]), null);
  assert.equal(parseMetaMeasurement({ consented: false, event_id: "abc" }), null);
  assert.equal(parseMetaMeasurement({ consented: "yes", event_id: "abc" }), null);
  assert.equal(parseMetaMeasurement({ consented: true }), null);
});

test("parseMetaMeasurement accepts event_id and optional fbp/fbc", () => {
  assert.deepEqual(
    parseMetaMeasurement({ consented: true, event_id: " abc " }),
    { event_id: "abc" },
  );
  assert.deepEqual(
    parseMetaMeasurement({ consented: true, event_id: "e1", fbp: " p ", fbc: " c " }),
    { event_id: "e1", fbp: "p", fbc: "c" },
  );
});

test("parseMetaMeasurement validates the Events Manager test_event_code", () => {
  assert.deepEqual(
    parseMetaMeasurement({ consented: true, event_id: "e1", test_event_code: " EAG84721 " }),
    { event_id: "e1", test_event_code: "EAG84721" },
  );
  // Invalid codes are dropped, never fatal to the submission.
  for (const bad of ["bad/code", "has space", "x".repeat(65), 123, ["EAG84721"]]) {
    assert.deepEqual(
      parseMetaMeasurement({ consented: true, event_id: "e1", test_event_code: bad }),
      { event_id: "e1" },
      `code ${JSON.stringify(bad)} must be dropped`,
    );
  }
});

test("missing or oversized fbp/fbc never breaks a submission", () => {
  // Absent entirely.
  assert.deepEqual(parseMetaMeasurement({ consented: true, event_id: "e1" }), {
    event_id: "e1",
  });
  // Oversized/invalid values are dropped, not fatal.
  const measurement = parseMetaMeasurement({
    consented: true,
    event_id: "e1",
    fbp: "x".repeat(2000),
    fbc: 42,
  });
  assert.deepEqual(measurement, { event_id: "e1" });
  // Oversized event_id is rejected as metadata, not as a submission.
  assert.equal(
    parseMetaMeasurement({ consented: true, event_id: "x".repeat(200) }),
    null,
  );
});

// --- payload construction ---------------------------------------------------

test("buildMetaLeadEvent emits exactly the approved shape", () => {
  const event = buildMetaLeadEvent(FULL_INPUT, 1_756_700_000);
  assert.deepEqual(event, {
    event_name: "Lead",
    event_time: 1_756_700_000,
    event_id: FULL_INPUT.eventId,
    event_source_url: FULL_INPUT.eventSourceUrl,
    action_source: "website",
    custom_data: { conversion_type: "follower" },
    user_data: {
      client_ip_address: "203.0.113.7",
      client_user_agent: "TestAgent/1.0",
      fbp: FULL_INPUT.fbp,
      fbc: FULL_INPUT.fbc,
    },
  });
});

test("trade_offer conversion_type is supported", () => {
  const event = buildMetaLeadEvent(
    { ...FULL_INPUT, conversionType: "trade_offer", eventSourceUrl: "https://spudchallenge.online/offer/" },
    1_756_700_000,
  );
  assert.deepEqual(event.custom_data, { conversion_type: "trade_offer" });
});

test("missing ip/agent/fbp/fbc produce an empty user_data, not an error", () => {
  const event = buildMetaLeadEvent(
    {
      conversionType: "follower",
      eventId: "e1",
      eventSourceUrl: "https://spudchallenge.online/",
      clientIpAddress: null,
      clientUserAgent: null,
    },
    1_756_700_000,
  );
  assert.deepEqual(event.user_data, {});
});

test("payload never carries PII or offer content keys", () => {
  const forbiddenKeys = new Set([
    "email",
    "em",
    "ph",
    "phone",
    "fn",
    "ln",
    "first_name",
    "last_name",
    "name",
    "db",
    "dob",
    "birth",
    "ge",
    "gender",
    "address",
    "zip",
    "zp",
    "ct",
    "city",
    "state",
    "st",
    "description",
    "item_name",
    "item_description",
    "photo",
    "photos",
    "file",
    "files",
    "storage_path",
  ]);
  const collectKeys = (value: unknown, into: Set<string>) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      into.add(key.toLowerCase());
      collectKeys(child, into);
    }
  };
  const keys = new Set<string>();
  collectKeys(buildMetaLeadEvent(FULL_INPUT, 1), keys);
  for (const key of keys) {
    assert.ok(!forbiddenKeys.has(key), `payload must not carry key "${key}"`);
  }
  // And no PII-shaped values sneak in anywhere.
  const serialized = JSON.stringify(buildMetaLeadEvent(FULL_INPUT, 1));
  assert.ok(!serialized.includes("@"));
  assert.ok(!/item|photo|offer/.test(serialized.replace("trade_offer", "")));
});

test("user_data only ever uses the approved field names", () => {
  const approved = new Set(["client_ip_address", "client_user_agent", "fbp", "fbc"]);
  const event = buildMetaLeadEvent(FULL_INPUT, 1);
  for (const key of Object.keys(event.user_data as Record<string, unknown>)) {
    assert.ok(approved.has(key), `unexpected user_data field: ${key}`);
  }
});

// --- delivery ----------------------------------------------------------------

function okFetch(captured: { url?: string; init?: RequestInit }) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    captured.url = String(url);
    captured.init = init;
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  }) as typeof fetch;
}

test("sendMetaLead skips silently when unconfigured", async () => {
  let called = false;
  const result = await sendMetaLead(null, FULL_INPUT, (async () => {
    called = true;
    return new Response("", { status: 200 });
  }) as typeof fetch);
  assert.equal(result, null);
  assert.equal(called, false);
});

test("sendMetaLead posts one approved event with a bearer token", async () => {
  const captured: { url?: string; init?: RequestInit } = {};
  const config = { accessToken: "secret-token", datasetId: "1055342657299625" };
  const result = await sendMetaLead(
    config,
    FULL_INPUT,
    okFetch(captured),
    { nowSeconds: () => 1_756_700_000 },
  );
  assert.deepEqual(result, { eventsReceived: 1 });
  assert.equal(captured.url, "https://graph.facebook.com/v25.0/1055342657299625/events");
  const headers = captured.init?.headers as Record<string, string>;
  assert.equal(headers.authorization, "Bearer secret-token");
  assert.equal(headers["content-type"], "application/json");
  const body = JSON.parse(String(captured.init?.body)) as { data: unknown[] };
  assert.equal(body.data.length, 1);
  // The token itself must not travel in the body.
  assert.ok(!String(captured.init?.body).includes("secret-token"));
});

test("sendMetaLead throws on rejection without leaking the token", async () => {
  const config = { accessToken: "secret-token", datasetId: "123" };
  await assert.rejects(
    sendMetaLead(config, FULL_INPUT, (async () =>
      new Response("nope", { status: 500 })) as typeof fetch),
    (err: Error) => {
      assert.match(err.message, /500/);
      assert.ok(!err.message.includes("secret-token"));
      return true;
    },
  );
});

test("sendMetaLead carries test_event_code top-level only, and only when valid", async () => {
  const config = { accessToken: "tok", datasetId: "123" };
  const captured: { init?: RequestInit } = {};

  await sendMetaLead(config, { ...FULL_INPUT, testEventCode: "EAG84721" }, okFetch(captured), {
    nowSeconds: () => 1,
  });
  let body = JSON.parse(String(captured.init?.body)) as Record<string, unknown>;
  assert.equal(body.test_event_code, "EAG84721");
  // The tag lives at the top level of the request, never inside the event.
  const event = (body.data as Array<Record<string, unknown>>)[0];
  assert.ok(!("test_event_code" in event));
  assert.deepEqual(event.custom_data, { conversion_type: "follower" });

  // No code → no tag in the body at all.
  await sendMetaLead(config, FULL_INPUT, okFetch(captured), { nowSeconds: () => 1 });
  body = JSON.parse(String(captured.init?.body)) as Record<string, unknown>;
  assert.ok(!("test_event_code" in body));

  // Malformed codes are never forwarded.
  await sendMetaLead(config, { ...FULL_INPUT, testEventCode: "bad/code" }, okFetch(captured), {
    nowSeconds: () => 1,
  });
  body = JSON.parse(String(captured.init?.body)) as Record<string, unknown>;
  assert.ok(!("test_event_code" in body));
});

test("recordMetaLeadBestEffort never throws and logs sanitized errors", async () => {
  const env = (key: string) =>
    key === "META_CAPI_ACCESS_TOKEN" ? "secret-token" : key === "META_DATASET_ID" ? "123" : undefined;
  const logs: string[] = [];
  const input = {
    conversionType: "follower" as const,
    eventSourceUrl: "https://spudchallenge.online/",
    clientIpAddress: null,
    clientUserAgent: null,
  };

  // No consent metadata → no call at all.
  await recordMetaLeadBestEffort(env, null, input, okFetch({}), (m) => logs.push(m));

  // Meta outage → swallowed, sanitized log, no token/body in the log.
  await recordMetaLeadBestEffort(
    env,
    { event_id: "e1" },
    input,
    (async () => new Response("nope", { status: 500 })) as typeof fetch,
    (m) => logs.push(m),
  );
  assert.equal(logs.length, 1);
  assert.match(logs[0], /^meta-capi failed: /);
  assert.ok(!logs[0].includes("secret-token"));
});

test("recordMetaLeadBestEffort reuses the browser event_id for dedup", async () => {
  const captured: { init?: RequestInit } = {};
  const env = (key: string) =>
    key === "META_CAPI_ACCESS_TOKEN" ? "tok" : key === "META_DATASET_ID" ? "123" : undefined;
  await recordMetaLeadBestEffort(
    env,
    { event_id: "shared-event-id", fbp: "fbp-value" },
    {
      conversionType: "trade_offer",
      eventSourceUrl: "https://spudchallenge.online/offer/",
      clientIpAddress: "203.0.113.7",
      clientUserAgent: "TestAgent/1.0",
    },
    okFetch(captured),
  );
  const body = JSON.parse(String(captured.init?.body)) as {
    data: Array<Record<string, unknown>>;
  };
  assert.equal(body.data[0].event_id, "shared-event-id");
  assert.deepEqual(body.data[0].custom_data, { conversion_type: "trade_offer" });
});

test("recordMetaLeadBestEffort forwards the test session tag for CAPI events", async () => {
  const captured: { init?: RequestInit } = {};
  const env = (key: string) =>
    key === "META_CAPI_ACCESS_TOKEN" ? "tok" : key === "META_DATASET_ID" ? "123" : undefined;
  await recordMetaLeadBestEffort(
    env,
    { event_id: "shared-event-id", test_event_code: "EAG84721" },
    {
      conversionType: "follower",
      eventSourceUrl: "https://spudchallenge.online/",
      clientIpAddress: null,
      clientUserAgent: null,
    },
    okFetch(captured),
  );
  const body = JSON.parse(String(captured.init?.body)) as Record<string, unknown>;
  assert.equal(body.test_event_code, "EAG84721");
});
