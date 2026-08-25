// offer-upload — issues signed upload URLs for anonymous offer photos.
// The bucket is private; only paths issued here (with a matching HMAC
// submit token) can be attached to an offer at submission time.

import { captchaConfig, fetchCaptchaVerification, verifyCaptchaToken } from "../_shared/captcha.ts";
import { corsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { errorMessage } from "../_shared/logging.ts";
import { checkRateLimit, clientIp } from "../_shared/rate-limit.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { UUID_RE } from "../_shared/offer-validation.ts";
import { issueOfferUpload } from "../_shared/storage.ts";

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
  if (!checkRateLimit(`offer-upload:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return json({ error: "Too many requests. Please try again in a few minutes." }, 429, cors);
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return json({ error: "Request too large." }, 413, cors);
  }

  try {
    const secret = Deno.env.get("PREFERENCE_TOKEN_SECRET");
    if (!secret) {
      return json({ error: "Offer uploads are not configured." }, 500, cors);
    }

    const supabase = getAdminClient();
    const settingsRes = await supabase
      .from("challenge_settings")
      .select("status, offers_paused")
      .eq("id", 1)
      .maybeSingle();
    if (settingsRes.error) throw settingsRes.error;
    const settings = settingsRes.data as { status?: string; offers_paused?: boolean } | null;
    if (settings?.offers_paused) {
      return json({ error: "Offers are paused right now. Please check back soon." }, 503, cors);
    }
    if (settings?.status !== "active") {
      return json({ error: "Offers open when the challenge starts." }, 409, cors);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "Invalid request." }, 400, cors);
    }
    const record = body as Record<string, unknown>;

    // Optional CAPTCHA — a no-op unless CAPTCHA_PROVIDER/CAPTCHA_SECRET set.
    const captcha = captchaConfig((key) => Deno.env.get(key));
    if (!(await verifyCaptchaToken(captcha, record.captcha_token, clientIp(req), fetchCaptchaVerification))) {
      return json({ error: "CAPTCHA verification failed. Please try again." }, 400, cors);
    }

    const draftId = typeof record.draft_id === "string" ? record.draft_id : "";
    if (!UUID_RE.test(draftId)) {
      return json({ error: "Invalid upload session." }, 400, cors);
    }
    const fileType = typeof record.file_type === "string" ? record.file_type : "";
    const sizeBytes = typeof record.file_size === "number" ? record.file_size : Number.NaN;

    const issued = await issueOfferUpload({
      fileType,
      sizeBytes,
      draftId,
      secret,
    }).catch((err: Error) => err);

    if (issued instanceof Error) {
      return json({ error: issued.message }, 400, cors);
    }

    return json(issued, 200, cors);
  } catch (err) {
    console.error("offer-upload failed:", errorMessage(err));
    return json({ error: "Something went wrong. Please try again." }, 500, cors);
  }
});
