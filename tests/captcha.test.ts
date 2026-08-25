import test from "node:test";
import assert from "node:assert/strict";
import {
  captchaConfig,
  verifyCaptchaToken,
  type CaptchaFetch,
} from "../supabase/functions/_shared/captcha.ts";

function envOf(vars: Record<string, string>): (key: string) => string | undefined {
  return (key) => vars[key];
}

// Records calls instead of hitting the network.
function stubFetch(response: { success?: boolean } | null, fail = false): {
  fetch: CaptchaFetch;
  calls: Array<{ url: string; body: string }>;
} {
  const calls: Array<{ url: string; body: string }> = [];
  const fetch: CaptchaFetch = async (url, body) => {
    calls.push({ url, body });
    if (fail) throw new Error("network down");
    return response;
  };
  return { fetch, calls };
}

test("captchaConfig is disabled unless provider and secret are both set", () => {
  assert.equal(captchaConfig(envOf({})), null, "nothing configured");
  assert.equal(captchaConfig(envOf({ CAPTCHA_PROVIDER: "turnstile" })), null, "missing secret");
  assert.equal(captchaConfig(envOf({ CAPTCHA_SECRET: "s" })), null, "missing provider");
  assert.equal(
    captchaConfig(envOf({ CAPTCHA_PROVIDER: "unknown", CAPTCHA_SECRET: "s" })),
    null,
    "unknown provider",
  );
  assert.equal(
    captchaConfig(envOf({ CAPTCHA_PROVIDER: "turnstile", CAPTCHA_SECRET: "  " })),
    null,
    "blank secret",
  );
});

test("captchaConfig maps supported providers to their verify endpoints", () => {
  const turnstile = captchaConfig(envOf({ CAPTCHA_PROVIDER: "Turnstile", CAPTCHA_SECRET: "s" }));
  assert.equal(turnstile?.provider, "turnstile", "provider name is case-insensitive");
  assert.equal(turnstile?.verifyUrl, "https://challenges.cloudflare.com/turnstile/v0/siteverify");

  const hcaptcha = captchaConfig(envOf({ CAPTCHA_PROVIDER: "hcaptcha", CAPTCHA_SECRET: "s" }));
  assert.equal(hcaptcha?.verifyUrl, "https://api.hcaptcha.com/siteverify");
});

test("verifyCaptchaToken passes without any network call when disabled", async () => {
  const { fetch, calls } = stubFetch({ success: false });
  const ok = await verifyCaptchaToken(null, undefined, null, fetch);
  assert.equal(ok, true);
  assert.equal(calls.length, 0, "disabled CAPTCHA must not call the provider");
});

test("verifyCaptchaToken rejects malformed tokens without calling the provider", async () => {
  const config = captchaConfig(envOf({ CAPTCHA_PROVIDER: "turnstile", CAPTCHA_SECRET: "s" }))!;
  const { fetch, calls } = stubFetch({ success: true });
  assert.equal(await verifyCaptchaToken(config, undefined, null, fetch), false);
  assert.equal(await verifyCaptchaToken(config, "", null, fetch), false);
  assert.equal(await verifyCaptchaToken(config, 12345, null, fetch), false);
  assert.equal(await verifyCaptchaToken(config, "x".repeat(4097), null, fetch), false);
  assert.equal(calls.length, 0);
});

test("verifyCaptchaToken posts secret + token + ip and honors the provider verdict", async () => {
  const config = captchaConfig(envOf({ CAPTCHA_PROVIDER: "hcaptcha", CAPTCHA_SECRET: "sec" }))!;

  const good = stubFetch({ success: true });
  assert.equal(await verifyCaptchaToken(config, "tok-1", "203.0.113.9", good.fetch), true);
  assert.equal(good.calls.length, 1);
  assert.equal(good.calls[0].url, "https://api.hcaptcha.com/siteverify");
  const params = new URLSearchParams(good.calls[0].body);
  assert.equal(params.get("secret"), "sec");
  assert.equal(params.get("response"), "tok-1");
  assert.equal(params.get("remoteip"), "203.0.113.9");

  const bad = stubFetch({ success: false });
  assert.equal(await verifyCaptchaToken(config, "tok-2", null, bad.fetch), false);
  assert.ok(!new URLSearchParams(bad.calls[0].body).has("remoteip"), "no ip, no remoteip field");
});

test("verifyCaptchaToken is fail-closed on provider errors", async () => {
  const config = captchaConfig(envOf({ CAPTCHA_PROVIDER: "turnstile", CAPTCHA_SECRET: "s" }))!;
  assert.equal(await verifyCaptchaToken(config, "tok", null, stubFetch(null, true).fetch), false);
  assert.equal(await verifyCaptchaToken(config, "tok", null, stubFetch(null).fetch), false);
  assert.equal(await verifyCaptchaToken(config, "tok", null, stubFetch({}).fetch), false);
});
