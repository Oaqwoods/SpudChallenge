// track-event — lightweight public analytics (playbook PROMPT 14 / build
// spec §13). Fire-and-forget telemetry: event name + pathname + UTMs + a
// coarse detail string. Never accepts or stores emails, phone numbers,
// offer text, uploaded files or other sensitive form data — the allowlist
// and length caps below make that structural, not procedural.

import { corsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { sanitizeText } from "../_shared/email.ts";
import { errorMessage } from "../_shared/logging.ts";
import { checkRateLimit, clientIp } from "../_shared/rate-limit.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";

// Mirrors the analytics_events_name check constraint (migration 8).
const ALLOWED_EVENTS: ReadonlySet<string> = new Set([
  "page_view",
  "follow_cta_clicked",
  "follower_submitted",
  "follower_wall_opt_in",
  "potential_trader_captured",
  "offer_cta_clicked",
  "offer_started",
  "offer_submitted",
  "share_clicked",
  "rules_viewed",
  "trade_detail_viewed",
]);

const RATE_LIMIT = 300;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 16_384;

function json(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405, cors);
  }
  if (origin && !isOriginAllowed(origin)) {
    return json({ error: "Origin not allowed." }, 403, cors);
  }
  if (!checkRateLimit(`track:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    // Analytics must never hurt the visitor: report success and drop it.
    return json({ ok: true }, 200, cors);
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    // Oversized telemetry bodies are abuse, never legitimate events.
    return json({ ok: true }, 200, cors);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "Invalid request." }, 400, cors);
    }
    const record = body as Record<string, unknown>;

    const event = typeof record.event === "string" ? record.event : "";
    if (!ALLOWED_EVENTS.has(event)) {
      return json({ error: "Unknown event." }, 400, cors);
    }

    const row = {
      event,
      path: sanitizeText(record.path, 200),
      detail: sanitizeText(record.detail, 100),
      utm_source: sanitizeText(record.utm_source, 100),
      utm_medium: sanitizeText(record.utm_medium, 100),
      utm_campaign: sanitizeText(record.utm_campaign, 100),
    };

    const { error } = await getAdminClient().from("analytics_events").insert(row);
    if (error) throw error;
    return json({ ok: true }, 200, cors);
  } catch (err) {
    console.error("track-event failed:", errorMessage(err));
    // Telemetry is best-effort: never surface storage failures as errors.
    return json({ ok: true }, 200, cors);
  }
});
