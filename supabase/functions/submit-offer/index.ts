// submit-offer — public trade-offer submission (spec §5, §17A, §26, §28).
// Offers are written through the service role; there are no public INSERT
// policies on offers/offer_files. The authoritative current item is read
// from challenge_settings and snapshotted server-side — client-supplied
// values are never trusted. Submissions are accepted during prelaunch AND
// active; prelaunch offers are collected only (never selected/published,
// never start the clock).

import { captchaConfig, fetchCaptchaVerification, verifyCaptchaToken } from "../_shared/captcha.ts";
import { corsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { errorMessage } from "../_shared/logging.ts";
import { parseMetaMeasurement, recordMetaConversionBestEffort } from "../_shared/meta-capi.ts";
import { checkRateLimit, clientIp } from "../_shared/rate-limit.ts";
import { siteUrl } from "../_shared/resend.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import {
  offerGateReason,
  isValidCompUrl,
  isValidEmail,
  isAllowedPath,
  normalizeEmail,
  normalizePhone,
  isPositiveAmount,
  sanitizeText,
  verifyUploadSubmitToken,
  MAX_PHOTOS,
} from "../_shared/offer-validation.ts";
import { draftDirOfPath, storedFileNames, OFFER_UPLOAD_PREFIX } from "../_shared/storage.ts";

const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_BODY_BYTES = 65_536;
const CLAIMED_VALUE_CAP = 1_000_000_000;

const EXT_TO_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function json(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

interface PhotoInput {
  path: string;
  submit_token: string;
}

function parsePhotos(value: unknown): PhotoInput[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_PHOTOS) return null;
  const out: PhotoInput[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return null;
    const record = entry as Record<string, unknown>;
    if (typeof record.path !== "string" || typeof record.submit_token !== "string") return null;
    out.push({ path: record.path, submit_token: record.submit_token });
  }
  return out;
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
  if (!checkRateLimit(`offer:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return json({ error: "Too many offers submitted. Please try again in a few minutes." }, 429, cors);
  }

  try {
    const secret = Deno.env.get("PREFERENCE_TOKEN_SECRET");
    if (!secret) {
      return json({ error: "Offers are not configured." }, 500, cors);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "Invalid request." }, 400, cors);
    }
    const record = body as Record<string, unknown>;

    // Honeypot: silently accept bots.
    if (typeof record.website === "string" && record.website.trim() !== "") {
      return json({ ok: true }, 200, cors);
    }

    // Optional CAPTCHA — a no-op unless CAPTCHA_PROVIDER/CAPTCHA_SECRET set.
    const captcha = captchaConfig((key) => Deno.env.get(key));
    if (!(await verifyCaptchaToken(captcha, record.captcha_token, clientIp(req), fetchCaptchaVerification))) {
      return json({ error: "CAPTCHA verification failed. Please try again." }, 400, cors);
    }

    // --- Authoritative current item (spec §26) -------------------------
    const supabase = getAdminClient();
    const settingsRes = await supabase
      .from("challenge_settings")
      .select("status, offers_paused, end_at, current_trade_number, current_item_name, current_item_value")
      .eq("id", 1)
      .maybeSingle();
    if (settingsRes.error) throw settingsRes.error;
    const settings = settingsRes.data as {
      status?: string;
      offers_paused?: boolean;
      end_at?: string | null;
      current_trade_number?: number;
      current_item_name?: string;
      current_item_value?: number | string;
    } | null;
    if (!settings) {
      return json({ error: "Challenge is not available." }, 500, cors);
    }
    // Shared gate order (paused → ended → closed). Prelaunch and active are
    // both open; prelaunch offers are collected only — nothing here starts
    // the challenge clock (prompt 39 / spec §17A).
    const gate = offerGateReason(settings, Date.now());
    if (gate === "paused") {
      return json({ error: "Offers are paused right now. Please check back soon." }, 503, cors);
    }
    if (gate === "ended") {
      return json({ error: "The challenge has ended — offers are closed." }, 409, cors);
    }
    if (gate === "closed") {
      return json({ error: "Offers are not open right now. Please check back soon." }, 409, cors);
    }

    const currentTradeNumber = Number(settings.current_trade_number ?? 0);
    const clientTradeNumber = Number(record.offered_against_trade_number);
    if (!Number.isFinite(clientTradeNumber) || clientTradeNumber !== currentTradeNumber) {
      // The challenge advanced while the visitor was filling the form:
      // never silently attach the offer to the new item.
      return json(
        {
          error: "The current trade changed while you were filling this out.",
          code: "current_item_changed",
          current_trade_number: currentTradeNumber,
          current_item_name: settings.current_item_name ?? null,
          current_item_value: Number(settings.current_item_value ?? 0),
        },
        409,
        cors,
      );
    }

    // --- Field validation ------------------------------------------------
    const name = sanitizeText(record.name, 200);
    const email = normalizeEmail(record.email);
    if (!name) return json({ error: "Please enter your name." }, 400, cors);
    if (!email || !isValidEmail(email)) {
      return json({ error: "Please enter a valid email address." }, 400, cors);
    }
    const phone = normalizePhone(record.phone);

    const itemName = sanitizeText(record.item_name, 200);
    const itemDescription = sanitizeText(record.item_description, 5000);
    const claimedValue = isPositiveAmount(record.claimed_value, CLAIMED_VALUE_CAP);
    const condition = sanitizeText(record.condition, 100);
    const city = sanitizeText(record.city, 100);
    const state = sanitizeText(record.state, 100);
    const zip = sanitizeText(record.zip, 16);
    const travelDistance = sanitizeText(record.travel_distance, 200);
    const serialOrModel = sanitizeText(record.serial_or_model, 200);
    const compUrl = sanitizeText(record.comp_url, 2048);
    const whyGoodTrade = sanitizeText(record.why_good_trade, 2000);

    if (!itemName) return json({ error: "Please enter the item name." }, 400, cors);
    if (!itemDescription) return json({ error: "Please describe the item." }, 400, cors);
    if (claimedValue === null) {
      return json({ error: "Please enter a realistic approximate value." }, 400, cors);
    }
    if (!condition) return json({ error: "Please select the item condition." }, 400, cors);
    if (!city) return json({ error: "Please enter your city." }, 400, cors);
    if (!state) return json({ error: "Please enter your state." }, 400, cors);
    if (typeof record.in_person !== "boolean") {
      return json({ error: "Please tell us whether you can trade in person." }, 400, cors);
    }
    if (compUrl !== null && !isValidCompUrl(compUrl)) {
      return json({ error: "The comparable-value link must be a valid http(s) URL." }, 400, cors);
    }
    if (!whyGoodTrade) {
      return json({ error: "Please tell us why this is a good next trade." }, 400, cors);
    }
    if (
      record.ownership_confirmed !== true ||
      record.not_acceptance_ack !== true ||
      record.terms_accepted !== true
    ) {
      return json({ error: "Please confirm ownership and accept the terms." }, 400, cors);
    }

    // --- Photos: HMAC-bound, prefix-checked, existence-checked -----------
    const photos = parsePhotos(record.photos);
    if (photos === null) {
      return json({ error: `Up to ${MAX_PHOTOS} photos are allowed.` }, 400, cors);
    }
    const seen = new Set<string>();
    const verifiedPaths: Array<{ path: string; mime: string }> = [];
    const dirCache = new Map<string, Set<string>>();

    for (const photo of photos) {
      if (seen.has(photo.path)) {
        return json({ error: "Duplicate photo submission." }, 400, cors);
      }
      seen.add(photo.path);
      if (!photo.path.startsWith(`${OFFER_UPLOAD_PREFIX}/`) || !isAllowedPath(photo.path)) {
        return json({ error: "Invalid photo reference." }, 400, cors);
      }
      if (!(await verifyUploadSubmitToken(secret, photo.path, photo.submit_token))) {
        return json({ error: "Photo upload session expired. Please re-add your photos." }, 400, cors);
      }
      const draft = draftDirOfPath(photo.path);
      if (!draft) return json({ error: "Invalid photo reference." }, 400, cors);
      if (!dirCache.has(draft.dir)) {
        dirCache.set(draft.dir, await storedFileNames(draft.dir));
      }
      const fileName = photo.path.split("/").pop() ?? "";
      if (!dirCache.get(draft.dir)!.has(fileName)) {
        return json({ error: "A photo upload is missing. Please re-add your photos." }, 400, cors);
      }
      const ext = (photo.path.split(".").pop() ?? "").toLowerCase();
      verifiedPaths.push({ path: photo.path, mime: EXT_TO_MIME[ext] ?? "image/jpeg" });
    }

    // --- Insert offer + files --------------------------------------------
    const offerInsert = await supabase
      .from("offers")
      .insert({
        name,
        email,
        phone,
        // Authoritative snapshot — never the browser's values (spec §26).
        offered_against_trade_number: currentTradeNumber,
        offered_against_item_name: settings.current_item_name ?? "",
        offered_against_item_value: Number(settings.current_item_value ?? 0),
        item_name: itemName,
        item_description: itemDescription,
        claimed_value: claimedValue,
        condition,
        city,
        state,
        zip,
        in_person: record.in_person,
        travel_distance: travelDistance,
        serial_or_model: serialOrModel,
        comp_url: compUrl,
        why_good_trade: whyGoodTrade,
        ownership_confirmed: true,
        terms_accepted: true,
        status: "new",
        utm_source: sanitizeText(record.utm_source, 200),
        utm_medium: sanitizeText(record.utm_medium, 200),
        utm_campaign: sanitizeText(record.utm_campaign, 200),
        landing_variant: sanitizeText(record.landing_variant, 50),
      })
      .select("id")
      .single();
    if (offerInsert.error) throw offerInsert.error;

    const offerId = (offerInsert.data as { id: string }).id;
    if (verifiedPaths.length > 0) {
      const filesInsert = await supabase.from("offer_files").insert(
        verifiedPaths.map((p) => ({
          offer_id: offerId,
          storage_path: p.path,
          file_type: p.mime,
        })),
      );
      if (filesInsert.error) throw filesInsert.error;
    }

    // Best-effort Meta Conversions API Lead (prompt 40 / spec §39): only
    // after the offer + files were written, only with browser-attested
    // consent, and any Meta failure is swallowed so the offer is unaffected.
    // trade_offer maps to the Meta standard event "Lead".
    const offerIp = clientIp(req);
    await recordMetaConversionBestEffort(
      (key) => Deno.env.get(key),
      parseMetaMeasurement(record.meta),
      {
        conversionType: "trade_offer",
        eventSourceUrl: `${siteUrl()}/offer/`,
        clientIpAddress: offerIp === "unknown" ? null : offerIp,
        clientUserAgent: req.headers.get("user-agent"),
      },
      fetch,
      {
        log: (message) => console.log("submit-offer " + message),
        logError: (message) => console.error("submit-offer " + message),
      },
    );

    // `prelaunch` tells the form which confirmation copy to show; the offer
    // itself is identical in both phases (status "new", collection only).
    return json({ ok: true, prelaunch: settings.status === "prelaunch" }, 200, cors);
  } catch (err) {
    console.error("submit-offer failed:", errorMessage(err));
    return json({ error: "Something went wrong. Please try again." }, 500, cors);
  }
});
