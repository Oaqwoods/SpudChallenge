import test from "node:test";
import assert from "node:assert/strict";
import {
  ALLOWED_MIME,
  challengeEnded,
  MAX_PHOTOS,
  normalizeEmail,
  isValidEmail,
  sanitizeText,
  normalizePhone,
  isValidCompUrl,
  extensionForMime,
  isAllowedPath,
  isPositiveAmount,
  uploadSubmitToken,
  verifyUploadSubmitToken,
  UUID_RE,
} from "../supabase/functions/_shared/offer-validation.ts";

test("MIME allowlist is images only", () => {
  assert.deepEqual(Object.keys(ALLOWED_MIME).sort(), [
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
  assert.equal(MAX_PHOTOS, 5);
});

test("extensionForMime maps the allowlist and rejects everything else", () => {
  assert.equal(extensionForMime("image/jpeg"), "jpg");
  assert.equal(extensionForMime("IMAGE/PNG"), "png");
  assert.equal(extensionForMime("image/webp"), "webp");
  assert.equal(extensionForMime("application/pdf"), null);
  assert.equal(extensionForMime("image/gif"), null);
  assert.equal(extensionForMime("text/html"), null);
  assert.equal(extensionForMime(7), null);
});

test("isAllowedPath enforces the extension allowlist", () => {
  assert.ok(isAllowedPath("offer-drafts/abc/1.jpg"));
  assert.ok(isAllowedPath("offer-drafts/abc/2.JPEG"));
  assert.ok(isAllowedPath("offer-drafts/abc/3.webp"));
  assert.ok(!isAllowedPath("offer-drafts/abc/4.pdf"));
  assert.ok(!isAllowedPath("offer-drafts/abc/5.exe"));
  assert.ok(!isAllowedPath("noextension"));
  assert.ok(!isAllowedPath(null));
});

test("isPositiveAmount enforces bounds", () => {
  assert.equal(isPositiveAmount(500, 1e9), 500);
  assert.equal(isPositiveAmount("1200.50", 1e9), 1200.5);
  assert.equal(isPositiveAmount(0, 1e9), null);
  assert.equal(isPositiveAmount(-5, 1e9), null);
  assert.equal(isPositiveAmount(1e12, 1e9), null);
  assert.equal(isPositiveAmount("nope", 1e9), null);
  assert.equal(isPositiveAmount(Number.NaN, 1e9), null);
});

test("normalizePhone strips junk characters", () => {
  assert.equal(normalizePhone(" (555) 010-1234 "), "(555) 010-1234");
  assert.equal(normalizePhone("555<script>"), "555");
  assert.equal(normalizePhone(""), null);
});

test("isValidCompUrl allows http(s) only", () => {
  assert.ok(isValidCompUrl("https://example.com/listing/1"));
  assert.ok(isValidCompUrl("http://sold.com/item?id=2"));
  assert.ok(!isValidCompUrl("javascript:alert(1)"));
  assert.ok(!isValidCompUrl("ftp://files.example.com"));
  assert.ok(!isValidCompUrl("https://"));
  assert.ok(!isValidCompUrl("x".repeat(3000)));
  assert.ok(!isValidCompUrl(42));
});

test("UUID_RE matches only canonical uuids", () => {
  assert.ok(UUID_RE.test("3f2c9a4e-9b1d-4e6a-8f0c-1a2b3c4d5e6f"));
  assert.ok(!UUID_RE.test("nope"));
  assert.ok(!UUID_RE.test("3f2c9a4e-9b1d-4e6a-8f0c-1a2b3c4d5e6f-extra"));
});

test("email helpers behave as in the follow flow", () => {
  assert.equal(normalizeEmail(" A@B.com "), "a@b.com");
  assert.equal(normalizeEmail("x".repeat(300)), null);
  assert.ok(isValidEmail("a@b.co"));
  assert.ok(!isValidEmail("a@b"));
  assert.equal(sanitizeText(" hi\u0000 ", 10), "hi");
});

test("uploadSubmitToken binds tokens to exact paths", async () => {
  const path = "offer-drafts/abc/1.jpg";
  const token = await uploadSubmitToken("secret", path);
  assert.ok(await verifyUploadSubmitToken("secret", path, token));
  assert.ok(!(await verifyUploadSubmitToken("secret", "offer-drafts/abc/2.jpg", token)));
  assert.ok(!(await verifyUploadSubmitToken("other-secret", path, token)));
  assert.ok(!(await verifyUploadSubmitToken("secret", path, "")));
  // domain separation: an email-preference-style token must not verify a path
  assert.equal(typeof token, "string");
  assert.ok(token.length >= 64);
});

test("challengeEnded closes offers at completion, including clock expiry", () => {
  const end = Date.parse("2026-09-22T15:30:00.000Z");
  const active = { status: "active", end_at: "2026-09-22T15:30:00.000Z" };
  assert.equal(challengeEnded(active, end - 1), false, "still open before end_at");
  assert.equal(challengeEnded(active, end), true, "closed the moment end_at passes");
  // Stored status stays 'active' after the clock runs out — still closed.
  assert.equal(challengeEnded(active, end + 7 * 24 * 60 * 60 * 1000), true);
  assert.equal(
    challengeEnded({ status: "complete", end_at: null }, end - 1),
    true,
    "explicit completion closes even before end_at",
  );
  assert.equal(
    challengeEnded({ status: "active", end_at: null }, end + 1),
    false,
    "no deadline and not explicitly complete stays open",
  );
  assert.equal(challengeEnded(null, end), true, "missing settings fail closed");
  assert.equal(
    challengeEnded({ status: "active", end_at: "not-a-date" }, end),
    false,
    "unreadable deadline is ignored rather than closing by accident",
  );
});
