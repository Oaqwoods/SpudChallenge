import test from "node:test";
import assert from "node:assert/strict";
import { normalizeEmail, isValidEmail, sanitizeText } from "../supabase/functions/_shared/email.ts";
import { preferenceToken, verifyPreferenceToken } from "../supabase/functions/_shared/token.ts";
import { checkRateLimit } from "../supabase/functions/_shared/rate-limit.ts";

test("normalizeEmail trims and lowercases", () => {
  assert.equal(normalizeEmail("  Foo@Example.COM "), "foo@example.com");
});

test("normalizeEmail rejects empty, oversized, and non-strings", () => {
  assert.equal(normalizeEmail("   "), null);
  assert.equal(normalizeEmail("a@b.co".padEnd(300, "x")), null);
  assert.equal(normalizeEmail(42), null);
  assert.equal(normalizeEmail(null), null);
});

test("isValidEmail accepts normal addresses, rejects junk", () => {
  assert.ok(isValidEmail("foo@example.com"));
  assert.ok(isValidEmail("a.b+tag@sub.domain.co"));
  assert.ok(!isValidEmail("foo"));
  assert.ok(!isValidEmail("foo@bar"));
  assert.ok(!isValidEmail("foo @bar.com"));
});

test("sanitizeText strips control chars and caps length", () => {
  assert.equal(sanitizeText("  Spud\u0000\r\n", 100), "Spud");
  assert.equal(sanitizeText("x".repeat(500), 10), "xxxxxxxxxx");
  assert.equal(sanitizeText("   ", 10), null);
  assert.equal(sanitizeText(undefined, 10), null);
});

test("preferenceToken lowercases and is deterministic", async () => {
  const a = await preferenceToken("secret", "foo@example.com");
  const b = await preferenceToken("secret", "FOO@EXAMPLE.COM");
  assert.equal(a, b);
  const different = await preferenceToken("secret", "other@example.com");
  assert.notEqual(a, different);
});

test("verifyPreferenceToken roundtrips and rejects mismatches", async () => {
  const token = await preferenceToken("s3cret", "x@y.io");
  assert.ok(await verifyPreferenceToken("s3cret", "x@y.io", token));
  assert.ok(!(await verifyPreferenceToken("s3cret", "other@y.io", token)));
  assert.ok(!(await verifyPreferenceToken("wrong-secret", "x@y.io", token)));
  assert.ok(!(await verifyPreferenceToken("s3cret", "x@y.io", "")));
});

test("checkRateLimit allows up to the limit, then blocks, then resets", () => {
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) {
    assert.ok(checkRateLimit("ip1", 3, 1000, t0 + i));
  }
  assert.ok(!checkRateLimit("ip1", 3, 1000, t0 + 10));
  assert.ok(checkRateLimit("ip1", 3, 1000, t0 + 1001));
  // separate keys are independent
  assert.ok(checkRateLimit("ip2", 3, 1000, t0));
});
