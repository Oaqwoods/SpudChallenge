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
