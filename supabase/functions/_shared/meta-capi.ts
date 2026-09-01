// Meta Conversions API (CAPI) — consent-gated, best-effort server-side Lead
// measurement (playbook PROMPT 40 / build spec §39).
//
// Hard rules:
// - A Lead is sent ONLY after the caller's database operation has succeeded.
// - Only the browser-attested consent flag unlocks measurement; a request
//   without `meta: { consented: true }` never produces a CAPI call.
// - Only approved fields are transmitted: event metadata plus client IP,
//   user agent and the Meta `_fbp`/`_fbc` attribution cookies (unhashed).
//   Never email, phone, names, offer text, item descriptions, photo/file
//   data or any admin data.
// - Delivery failures must never fail the underlying signup/offer. This
//   module throws on transport/HTTP errors; callers catch and log only the
//   sanitized error message. The access token never enters logs or client
//   responses.
//
// Graph API version v25.0 (released 2026-02-18, available until 2028-07-29
// per Meta's published changelog at selection time). The pure helpers keep
// env/fetch injected so they run under node:test (tests/meta-capi.test.ts).

import { errorMessage } from "./logging.ts";

export const META_GRAPH_VERSION = "v25.0";
export const META_CAPI_TIMEOUT_MS = 5_000;
const MAX_META_FIELD_LENGTH = 1_024;
const MAX_EVENT_ID_LENGTH = 128;

export type MetaConversionType = "follower" | "trade_offer";

// Events Manager "Test events" codes: short alphanumerics only. Events sent
// with this tag appear in Meta's test tool and are excluded from production
// statistics — both the browser Pixel (via the page URL) and the CAPI call
// must carry the SAME code for a test session to show the deduplicated pair.
const TEST_EVENT_CODE_RE = /^[A-Za-z0-9]{1,64}$/;

export interface MetaMeasurement {
  event_id: string;
  fbp?: string;
  fbc?: string;
  test_event_code?: string;
}

export interface MetaCapiConfig {
  accessToken: string;
  datasetId: string;
}

// env is injected so this stays testable outside Deno.
export function metaCapiConfig(
  env: (key: string) => string | undefined,
): MetaCapiConfig | null {
  const accessToken = env("META_CAPI_ACCESS_TOKEN");
  const datasetId = env("META_DATASET_ID");
  if (!accessToken || accessToken.trim() === "") return null;
  if (!datasetId || datasetId.trim() === "") return null;
  return { accessToken: accessToken.trim(), datasetId: datasetId.trim() };
}

function cleanMetaField(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > maxLength) return null;
  return trimmed;
}

// Extract the OPTIONAL `meta` measurement metadata from a submission body.
// Returns null whenever consent is missing or the metadata is unusable —
// meta metadata must never fail a submission.
export function parseMetaMeasurement(value: unknown): MetaMeasurement | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.consented !== true) return null;
  const eventId = cleanMetaField(record.event_id, MAX_EVENT_ID_LENGTH);
  if (!eventId) return null;
  const measurement: MetaMeasurement = { event_id: eventId };
  const fbp = cleanMetaField(record.fbp, MAX_META_FIELD_LENGTH);
  if (fbp) measurement.fbp = fbp;
  const fbc = cleanMetaField(record.fbc, MAX_META_FIELD_LENGTH);
  if (fbc) measurement.fbc = fbc;
  const testEventCode = cleanMetaField(record.test_event_code, 64);
  if (testEventCode && TEST_EVENT_CODE_RE.test(testEventCode)) {
    measurement.test_event_code = testEventCode;
  }
  return measurement;
}

export interface MetaLeadInput {
  conversionType: MetaConversionType;
  eventId: string;
  eventSourceUrl: string;
  clientIpAddress: string | null;
  clientUserAgent: string | null;
  fbp?: string;
  fbc?: string;
  // Optional Events Manager "Test events" tag — travels at the TOP LEVEL of
  // the CAPI request body (not inside the event object).
  testEventCode?: string;
}

// The exact approved CAPI event payload, built in one place so the field
// allow-list is visible and testable. IP/user-agent/fbp/fbc are sent
// unhashed per the approved user_data fields for this integration.
export function buildMetaLeadEvent(
  input: MetaLeadInput,
  eventTimeUnix: number,
): Record<string, unknown> {
  const userData: Record<string, string> = {};
  if (input.clientIpAddress) userData.client_ip_address = input.clientIpAddress;
  if (input.clientUserAgent) userData.client_user_agent = input.clientUserAgent;
  if (input.fbp) userData.fbp = input.fbp;
  if (input.fbc) userData.fbc = input.fbc;
  return {
    event_name: "Lead",
    event_time: eventTimeUnix,
    event_id: input.eventId,
    event_source_url: input.eventSourceUrl,
    action_source: "website",
    custom_data: { conversion_type: input.conversionType },
    user_data: userData,
  };
}

export function metaEventsUrl(
  datasetId: string,
  graphVersion: string = META_GRAPH_VERSION,
): string {
  return `https://graph.facebook.com/${graphVersion}/${datasetId}/events`;
}

export interface MetaLeadResult {
  eventsReceived: number;
}

const MAX_META_ERROR_DETAIL_LENGTH = 300;

// Meta's error body ({error: {message, type, code}}) explains a rejection —
// "Invalid OAuth access token", "Object with ID ... does not exist", invalid
// parameter names — and is the only signal for why a Lead never reached
// Events Manager. Only those three fields are kept (never the raw body),
// so neither the token nor submission content can enter a log line.
export function sanitizedMetaErrorDetail(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== "object") return "";
  const record = error as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof record.message === "string" && record.message.trim()) {
    parts.push(record.message.trim());
  }
  if (typeof record.type === "string" && record.type.trim()) {
    parts.push(record.type.trim());
  }
  if (typeof record.code === "number" || typeof record.code === "string") {
    parts.push(`code ${record.code}`);
  }
  return parts.join(" | ").slice(0, MAX_META_ERROR_DETAIL_LENGTH);
}

// Sends one Lead through CAPI. Returns null when CAPI is not configured
// (silent skip). Throws on transport/HTTP errors so callers can log a
// sanitized error; callers must always catch — Meta failures never fail a
// submission. The access token travels only in the Authorization header.
export async function sendMetaLead(
  config: MetaCapiConfig | null,
  input: MetaLeadInput,
  fetchImpl: typeof fetch,
  options: {
    timeoutMs?: number;
    graphVersion?: string;
    nowSeconds?: () => number;
  } = {},
): Promise<MetaLeadResult | null> {
  if (!config) return null;
  const event = buildMetaLeadEvent(
    input,
    (options.nowSeconds ?? (() => Math.floor(Date.now() / 1000)))(),
  );
  const body: Record<string, unknown> = { data: [event] };
  if (input.testEventCode && TEST_EVENT_CODE_RE.test(input.testEventCode)) {
    body.test_event_code = input.testEventCode;
  }
  const res = await fetchImpl(metaEventsUrl(config.datasetId, options.graphVersion), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.accessToken}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs ?? META_CAPI_TIMEOUT_MS),
  });
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as unknown;
    const detail = sanitizedMetaErrorDetail(payload);
    throw new Error(
      `Meta CAPI rejected the Lead (HTTP ${res.status}${detail ? `: ${detail}` : ""}).`,
    );
  }
  const parsed = (await res.json().catch(() => null)) as {
    events_received?: number;
  } | null;
  return { eventsReceived: Number(parsed?.events_received ?? 0) };
}

export interface MetaCapiLoggers {
  log?: (message: string) => void;
  logError?: (message: string) => void;
}

// Sanitized context appended to every meta-capi log line. Only values that
// are safe and diagnostic: the dedup event_id (a random UUID) and the
// Events Manager test code (a short-lived, non-secret test tag). Deliberately
// NOT logged: fbp/fbc, IP, user agent, or any submission content.
function measurementContext(measurement: MetaMeasurement): string {
  const testCode = measurement.test_event_code
    ? `test_event_code=${measurement.test_event_code}`
    : "test_event_code=absent";
  return `event_id=${measurement.event_id}, ${testCode}`;
}

// Fire-and-log wrapper for Edge Function handlers: sends the Lead when
// measurement metadata and CAPI config are present, and converts every
// outcome into a sanitized log line so delivery is observable in the Edge
// Function logs — a consented conversion that never reaches Meta must be
// distinguishable from one Meta rejected (and why). Never throws, never
// returns detail that could leak the access token or submission contents.
export async function recordMetaLeadBestEffort(
  env: (key: string) => string | undefined,
  measurement: MetaMeasurement | null,
  input: Omit<MetaLeadInput, "eventId" | "fbp" | "fbc" | "testEventCode">,
  fetchImpl: typeof fetch,
  loggers: MetaCapiLoggers = {},
): Promise<void> {
  const log = loggers.log ?? ((message) => console.log(message));
  const logError = loggers.logError ?? ((message) => console.error(message));
  if (!measurement) return;
  const context = measurementContext(measurement);
  const config = metaCapiConfig(env);
  if (!config) {
    // Consented conversion with no CAPI secrets: a silent skip here means
    // the Lead never leaves the function, so this must be visible.
    logError(
      `meta-capi skipped: META_CAPI_ACCESS_TOKEN/META_DATASET_ID not configured (${context})`,
    );
    return;
  }
  try {
    const result = await sendMetaLead(
      config,
      {
        ...input,
        eventId: measurement.event_id,
        fbp: measurement.fbp,
        fbc: measurement.fbc,
        testEventCode: measurement.test_event_code,
      },
      fetchImpl,
    );
    if (!result) return;
    if (result.eventsReceived > 0) {
      log(`meta-capi Lead accepted (events_received=${result.eventsReceived}, ${context})`);
    } else {
      logError(`meta-capi Lead accepted but events_received=0 (${context})`);
    }
  } catch (err) {
    logError(`meta-capi failed: ${errorMessage(err)} (${context})`);
  }
}
