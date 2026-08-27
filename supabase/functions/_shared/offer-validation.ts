// Pure offer-submission validation — shared by the Edge Functions and
// unit-tested under Node. No Deno/Supabase imports here (email helpers are
// reused from ./email.ts).

import { isValidEmail, normalizeEmail, sanitizeText } from "./email.ts";

export { isValidEmail, normalizeEmail, sanitizeText };

export const MAX_PHOTOS = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

// Strict image allowlist only — anonymous document uploads are rejected
// (spec §28: no identity/title/proof-of-ownership documents from the public).
export const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizePhone(value: unknown): string | null {
  const text = sanitizeText(value, 32);
  if (!text) return null;
  const cleaned = text.replace(/[^\d+\-() .]/g, "").trim();
  return cleaned.length > 0 ? cleaned : null;
}

// https? only; never fetched by the backend, stored and rendered as text.
export function isValidCompUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (value.length > 2048) return false;
  return /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(value);
}

export function extensionForMime(mime: unknown): string | null {
  if (typeof mime !== "string") return null;
  return ALLOWED_MIME[mime.toLowerCase()] ?? null;
}

export function isAllowedPath(path: unknown): boolean {
  if (typeof path !== "string") return false;
  const ext = path.split(".").pop()?.toLowerCase();
  return ext !== undefined && ALLOWED_EXTENSIONS.has(ext);
}

export function isPositiveAmount(value: unknown, cap: number): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  if (n <= 0 || n > cap) return null;
  return n;
}

// Prompt 30: at completion, new offers are disabled by default. Completion
// is explicit (stored status 'complete') or the clock running out — the
// stored status stays 'active' past end_at until an admin flips it, so the
// deadline must be checked server-side too. Pure — unit tested under Node.
export function challengeEnded(
  settings: { status?: string | null; end_at?: string | null } | null,
  nowMs: number,
): boolean {
  // No authoritative settings: fail closed rather than accept offers into a
  // challenge we cannot place.
  if (!settings) return true;
  if (settings.status === "complete") return true;
  if (typeof settings.end_at === "string" && settings.end_at !== "") {
    const end = Date.parse(settings.end_at);
    if (!Number.isNaN(end) && nowMs >= end) return true;
  }
  return false;
}

// Prompt 39: submissions and photo uploads are open during prelaunch AND
// active. Prelaunch offers are collected only — nothing here starts the
// clock; start_at/end_at are set exclusively by START CHALLENGE NOW (or the
// admin schedule form). Unknown statuses fail closed. Pure — unit tested.
export function offersOpen(
  settings: { status?: string | null } | null,
): boolean {
  if (!settings) return false;
  return settings.status === "prelaunch" || settings.status === "active";
}

export type OfferGateReason = "paused" | "ended" | "closed";

// Single gate order shared by submit-offer and offer-upload so the two
// endpoints can never drift apart. Returns null when submissions/uploads
// may proceed, otherwise the reason to reject:
//   1. paused first — pausing blocks even before launch (spec §31)
//   2. ended — stored completion OR the 21-day clock running out
//   3. closed — any status outside prelaunch/active (fail closed)
// Pure — unit tested under Node.
export function offerGateReason(
  settings: {
    status?: string | null;
    offers_paused?: boolean | null;
    end_at?: string | null;
  } | null,
  nowMs: number,
): OfferGateReason | null {
  if (!settings) return "closed";
  if (settings.offers_paused) return "paused";
  if (challengeEnded(settings, nowMs)) return "ended";
  if (!offersOpen(settings)) return "closed";
  return null;
}

// HMAC binding between an issued upload path and the eventual offer
// submission: an attacker who guesses/learns a storage path cannot attach it
// to an offer without the matching submit token. Domain-separated from other
// token uses. Pure Web Crypto — testable under Node.

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export async function uploadSubmitToken(secret: string, path: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`offer-upload:${path}`),
  );
  return toHex(new Uint8Array(sig));
}

export async function verifyUploadSubmitToken(
  secret: string,
  path: string,
  token: string,
): Promise<boolean> {
  if (typeof token !== "string" || token.length === 0) return false;
  const expected = await uploadSubmitToken(secret, path);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}
