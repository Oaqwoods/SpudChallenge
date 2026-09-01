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

export interface MetaMeasurement {
  event_id: string;
  fbp?: string;
  fbc?: string;
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
  const res = await fetchImpl(metaEventsUrl(config.datasetId, options.graphVersion), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.accessToken}`,
    },
    body: JSON.stringify({ data: [event] }),
    signal: AbortSignal.timeout(options.timeoutMs ?? META_CAPI_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Meta CAPI rejected the Lead (HTTP ${res.status}).`);
  }
  const parsed = (await res.json().catch(() => null)) as {
    events_received?: number;
  } | null;
  return { eventsReceived: Number(parsed?.events_received ?? 0) };
}

// Fire-and-log wrapper for Edge Function handlers: sends the Lead when
// measurement metadata and CAPI config are present, and converts every
// failure into a sanitized log line. Never throws, never returns detail
// that could leak the access token or submission contents.
export async function recordMetaLeadBestEffort(
  env: (key: string) => string | undefined,
  measurement: MetaMeasurement | null,
  input: Omit<MetaLeadInput, "eventId" | "fbp" | "fbc">,
  fetchImpl: typeof fetch,
  logError: (message: string) => void = (message) => console.error(message),
): Promise<void> {
  if (!measurement) return;
  const config = metaCapiConfig(env);
  if (!config) return;
  try {
    await sendMetaLead(
      config,
      {
        ...input,
        eventId: measurement.event_id,
        fbp: measurement.fbp,
        fbc: measurement.fbc,
      },
      fetchImpl,
    );
  } catch (err) {
    logError(`meta-capi failed: ${errorMessage(err)}`);
  }
}
