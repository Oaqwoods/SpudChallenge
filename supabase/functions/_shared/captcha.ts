// Optional CAPTCHA integration point (playbook PROMPT 28 / build spec §28).
//
// DISABLED BY DEFAULT: unless CAPTCHA_PROVIDER and CAPTCHA_SECRET are set
// on the Edge Functions, captchaConfig() returns null and every public
// submission endpoint skips verification — behavior is byte-identical to
// pre-CAPTCHA. To enable:
//
//   supabase secrets set CAPTCHA_PROVIDER=turnstile CAPTCHA_SECRET=<secret>
//   (or CAPTCHA_PROVIDER=hcaptcha)
//
// …and render the matching provider widget on the public forms, sending the
// widget token as `captcha_token` in the existing JSON bodies (follow-signup,
// offer-upload, submit-offer). Verification is fail-closed: an unreachable
// provider or a malformed token rejects the submission. Unsubscribe links
// are deliberately exempt — they are already HMAC-token-bound and a CAPTCHA
// would break the emailed link flow.
//
// The config parser and verifier are pure (env access and fetch injected),
// unit tested from tests/captcha.test.ts.

export type CaptchaProvider = "turnstile" | "hcaptcha";

export interface CaptchaConfig {
  provider: CaptchaProvider;
  secret: string;
  verifyUrl: string;
}

const VERIFY_URLS: Record<CaptchaProvider, string> = {
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  hcaptcha: "https://api.hcaptcha.com/siteverify",
};

// env is injected so this stays testable outside Deno.
export function captchaConfig(
  env: (key: string) => string | undefined,
): CaptchaConfig | null {
  const provider = env("CAPTCHA_PROVIDER")?.toLowerCase();
  const secret = env("CAPTCHA_SECRET");
  if (provider !== "turnstile" && provider !== "hcaptcha") return null;
  if (!secret || secret.trim() === "") return null;
  return { provider, secret, verifyUrl: VERIFY_URLS[provider] };
}

export interface CaptchaVerifyResponse {
  success?: boolean;
}

// Injected verifier: (verifyUrl, urlencoded body) → parsed response or null.
export type CaptchaFetch = (
  verifyUrl: string,
  formBody: string,
) => Promise<CaptchaVerifyResponse | null>;

// Pure verification logic. Returns true without touching the network when
// CAPTCHA is not configured (disabled by default).
export async function verifyCaptchaToken(
  config: CaptchaConfig | null,
  token: unknown,
  remoteIp: string | null,
  fetchImpl: CaptchaFetch,
): Promise<boolean> {
  if (config === null) return true;
  if (typeof token !== "string" || token.length === 0 || token.length > 4096) {
    return false;
  }
  const params = new URLSearchParams({ secret: config.secret, response: token });
  if (remoteIp) params.set("remoteip", remoteIp);
  try {
    const result = await fetchImpl(config.verifyUrl, params.toString());
    return result?.success === true;
  } catch {
    return false;
  }
}

// Production adapter over global fetch. Both supported providers answer
// application/x-www-form-urlencoded POSTs with { success: boolean }.
export const fetchCaptchaVerification: CaptchaFetch = async (verifyUrl, formBody) => {
  try {
    const res = await fetch(verifyUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: formBody,
    });
    if (!res.ok) return null;
    return (await res.json()) as CaptchaVerifyResponse;
  } catch {
    return null;
  }
};
