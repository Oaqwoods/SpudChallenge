// email-preferences — signed-token preference updates (unsubscribe for V1).
// The token is HMAC(secret, email); a valid token proves the link was
// generated for that address. Unsubscribing also removes the person from the
// public follower wall automatically (the wall view filters on
// email_updates_unsubscribed_at / email_updates_opt_in).

import { corsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { isValidEmail, normalizeEmail } from "../_shared/email.ts";
import { errorMessage } from "../_shared/logging.ts";
import { checkRateLimit, clientIp } from "../_shared/rate-limit.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { verifyPreferenceToken } from "../_shared/token.ts";

const RATE_LIMIT = 20;
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
  if (!checkRateLimit(`prefs:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return json({ error: "Too many requests. Please try again in a few minutes." }, 429, cors);
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return json({ error: "Request too large." }, 413, cors);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "Invalid request." }, 400, cors);
    }
    const record = body as Record<string, unknown>;

    if (record.action !== "unsubscribe") {
      return json({ error: "Unknown action." }, 400, cors);
    }

    const email = normalizeEmail(record.email);
    const token = typeof record.token === "string" ? record.token : "";
    if (!email || !isValidEmail(email) || !token) {
      return json({ error: "Invalid unsubscribe link." }, 400, cors);
    }

    const secret = Deno.env.get("PREFERENCE_TOKEN_SECRET");
    if (!secret) {
      return json({ error: "Preference service is not configured." }, 500, cors);
    }
    if (!(await verifyPreferenceToken(secret, email, token))) {
      return json({ error: "Invalid unsubscribe link." }, 403, cors);
    }

    const supabase = getAdminClient();
    const res = await supabase
      .from("followers")
      .update({
        email_updates_opt_in: false,
        email_updates_unsubscribed_at: new Date().toISOString(),
      })
      .eq("email", email)
      .select("email")
      .maybeSingle();
    if (res.error) throw res.error;

    // Unknown addresses are treated as success to avoid leaking which
    // emails are subscribed (email enumeration).
    return json({ ok: true }, 200, cors);
  } catch (err) {
    console.error("email-preferences failed:", errorMessage(err));
    return json({ error: "Something went wrong. Please try again." }, 500, cors);
  }
});
