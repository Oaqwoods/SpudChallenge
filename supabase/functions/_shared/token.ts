// Stateless HMAC tokens for email preference links (unsubscribe).
// token = HMAC-SHA256(secret, normalized email) as hex. Runtime-agnostic:
// Web Crypto is available in both Deno Edge Functions and Node.

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export async function preferenceToken(secret: string, email: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(email.toLowerCase()));
  return toHex(new Uint8Array(sig));
}

export async function verifyPreferenceToken(
  secret: string,
  email: string,
  token: string,
): Promise<boolean> {
  if (typeof token !== "string" || token.length === 0) return false;
  const expected = await preferenceToken(secret, email);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return diff === 0;
}
