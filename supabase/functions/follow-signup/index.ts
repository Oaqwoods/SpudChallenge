// follow-signup — public email-preference capture (spec §4.9, §23, PROMPT 6).
// Writes through the service role; there are deliberately no public INSERT
// policies on followers. Sends a guarded Resend confirmation.

import { captchaConfig, fetchCaptchaVerification, verifyCaptchaToken } from "../_shared/captcha.ts";
import { corsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { isValidEmail, normalizeEmail, sanitizeText } from "../_shared/email.ts";
import { errorMessage } from "../_shared/logging.ts";
import { checkRateLimit, clientIp } from "../_shared/rate-limit.ts";
import { buildConfirmation, resendConfigured, sendEmail, siteUrl } from "../_shared/resend.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { preferenceToken } from "../_shared/token.ts";

const MAX_BODY_BYTES = 65_536;
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;

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
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return json({ error: "Request too large." }, 413, cors);
  }
  if (!checkRateLimit(`signup:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return json({ error: "Too many requests. Please try again in a few minutes." }, 429, cors);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "Invalid request." }, 400, cors);
    }
    const record = body as Record<string, unknown>;

    // Honeypot: silently accept bots that fill the hidden field.
    if (typeof record.website === "string" && record.website.trim() !== "") {
      return json({ ok: true, email_updates_opt_in: false, trade_interest: false }, 200, cors);
    }

    // Optional CAPTCHA — a no-op unless CAPTCHA_PROVIDER/CAPTCHA_SECRET set.
    const captcha = captchaConfig((key) => Deno.env.get(key));
    if (!(await verifyCaptchaToken(captcha, record.captcha_token, clientIp(req), fetchCaptchaVerification))) {
      return json({ error: "CAPTCHA verification failed. Please try again." }, 400, cors);
    }

    const email = normalizeEmail(record.email);
    if (!email || !isValidEmail(email)) {
      return json({ error: "Please enter a valid email address." }, 400, cors);
    }

    const emailUpdatesOptIn = record.email_updates_opt_in === true;
    const tradeInterest = record.trade_interest === true;
    if (!emailUpdatesOptIn && !tradeInterest) {
      return json({ error: "Choose at least one option to continue." }, 400, cors);
    }

    const firstName = sanitizeText(record.first_name, 100);
    const publicWallOptIn = record.public_wall_opt_in === true;
    const publicDisplayName = sanitizeText(record.public_display_name, 100);
    if (publicWallOptIn && !publicDisplayName && !firstName) {
      return json({ error: "Add a name to appear on the follower wall." }, 400, cors);
    }

    const supabase = getAdminClient();

    const settingsRes = await supabase
      .from("challenge_settings")
      .select("follower_signups_paused")
      .eq("id", 1)
      .maybeSingle();
    if (settingsRes.error) throw settingsRes.error;
    if (settingsRes.data?.follower_signups_paused) {
      return json({ error: "Signups are paused right now. Please check back soon." }, 503, cors);
    }

    const now = new Date().toISOString();
    const existingRes = await supabase
      .from("followers")
      .select("*")
      .eq("email", email)
      .maybeSingle();
    if (existingRes.error) throw existingRes.error;

    let resultRow: Record<string, unknown>;

    if (existingRes.data) {
      // Duplicate submission: update preferences safely instead of creating
      // a new row (spec §35). Choosing ongoing updates again is an explicit
      // resubscribe.
      const existing = existingRes.data as Record<string, unknown>;
      const updates: Record<string, unknown> = {};
      if (emailUpdatesOptIn) {
        updates.email_updates_opt_in = true;
        updates.email_updates_opted_in_at = existing.email_updates_opted_in_at ?? now;
        updates.email_updates_unsubscribed_at = null;
      }
      if (tradeInterest) {
        updates.trade_interest = true;
        updates.trade_interest_at = existing.trade_interest_at ?? now;
      }
      if (firstName) updates.first_name = firstName;
      if (publicWallOptIn) {
        updates.public_wall_opt_in = true;
        updates.public_display_name =
          publicDisplayName ?? firstName ?? existing.public_display_name;
      }

      const updateRes = await supabase
        .from("followers")
        .update(updates)
        .eq("email", email)
        .select()
        .single();
      if (updateRes.error) throw updateRes.error;
      resultRow = updateRes.data as Record<string, unknown>;
    } else {
      const insertRes = await supabase
        .from("followers")
        .insert({
          email,
          first_name: firstName,
          source: "homepage",
          email_updates_opt_in: emailUpdatesOptIn,
          email_updates_opted_in_at: emailUpdatesOptIn ? now : null,
          trade_interest: tradeInterest,
          trade_interest_at: tradeInterest ? now : null,
          public_wall_opt_in: publicWallOptIn,
          public_display_name: publicWallOptIn ? (publicDisplayName ?? firstName) : null,
          utm_source: sanitizeText(record.utm_source, 200),
          utm_medium: sanitizeText(record.utm_medium, 200),
          utm_campaign: sanitizeText(record.utm_campaign, 200),
          landing_variant: sanitizeText(record.landing_variant, 50),
        })
        .select()
        .single();
      if (insertRes.error) throw insertRes.error;
      resultRow = insertRes.data as Record<string, unknown>;
    }

    // Confirmation email — guarded. Missing Resend config or token secret
    // never blocks or loses the preference record. Every successful signup
    // gets one confirmation whose subject/body match the chosen preferences
    // (ongoing only / trade-interest only / combined — spec PROMPT 6).
    let emailSent = false;
    const tokenSecret = Deno.env.get("PREFERENCE_TOKEN_SECRET");
    if (resendConfigured() && tokenSecret) {
      const token = await preferenceToken(tokenSecret, email);
      const unsubscribeUrl =
        `${siteUrl()}/unsubscribe/?e=${encodeURIComponent(email)}&t=${token}`;
      const { subject, html } = buildConfirmation({
        emailUpdates: Boolean(resultRow.email_updates_opt_in),
        tradeInterest: Boolean(resultRow.trade_interest),
        unsubscribeUrl,
      });
      emailSent = await sendEmail({ to: email, subject, html });
    }

    return json(
      {
        ok: true,
        email_updates_opt_in: Boolean(resultRow.email_updates_opt_in),
        trade_interest: Boolean(resultRow.trade_interest),
        email_sent: emailSent,
      },
      200,
      cors,
    );
  } catch (err) {
    console.error("follow-signup failed:", errorMessage(err));
    return json({ error: "Something went wrong. Please try again." }, 500, cors);
  }
});
