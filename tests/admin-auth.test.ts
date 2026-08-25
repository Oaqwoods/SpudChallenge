import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  friendlyAuthMessage,
  friendlyAuthorizationMessage,
  friendlyPasswordUpdateMessage,
  interpretAdminProbe,
  interpretLoginAttempt,
  isRecoverySession,
  passwordResetRedirectTo,
  validateNewPassword,
} from "../lib/admin-auth.ts";

const ADMIN_USER = { id: "0b5f2f1e-2f3b-4d3a-9f1f-0d0e6b4b1a11", email: "admin@example.com" };

test("interpretAdminProbe grants admin only on a matching membership row", () => {
  assert.deepEqual(
    interpretAdminProbe(ADMIN_USER, { data: { user_id: ADMIN_USER.id }, error: null }),
    { status: "admin", userId: ADMIN_USER.id, email: "admin@example.com" },
  );
});

test("interpretAdminProbe denies a signed-in user without membership", () => {
  assert.deepEqual(
    interpretAdminProbe(ADMIN_USER, { data: null, error: null }),
    { status: "not_admin", userId: ADMIN_USER.id, email: "admin@example.com" },
  );
});

test("interpretAdminProbe treats a missing session as unauthenticated", () => {
  assert.deepEqual(
    interpretAdminProbe(null, { data: { user_id: ADMIN_USER.id }, error: null }),
    { status: "unauthenticated" },
  );
});

test("interpretAdminProbe never grants admin when the probe errors", () => {
  // A rejected/errored probe (expired JWT, network failure) must never be
  // interpreted as admin — even if a row was somehow also present.
  const errored = interpretAdminProbe(ADMIN_USER, {
    data: { user_id: ADMIN_USER.id },
    error: { message: "JWT expired" },
  });
  assert.equal(errored.status, "error");
});

// Regression (2026-08-25): the live database was missing GRANT SELECT on
// app_admins, so a perfectly valid signInWithPassword (Auth log: 200 /token)
// was followed by a PostgREST 401 membership probe, and the form displayed a
// credentials-flavored message. These tests pin successful-auth outcomes to
// authorization wording that can never be confused with "wrong password".

test("interpretLoginAttempt: successful auth + app_admins row logs the admin in", () => {
  assert.deepEqual(
    interpretLoginAttempt(null, { data: { user_id: ADMIN_USER.id }, error: null }),
    { kind: "admin" },
  );
});

test("interpretLoginAttempt: auth failure is reported as a credential error", () => {
  const outcome = interpretLoginAttempt({ message: "Invalid login credentials" }, null);
  assert.deepEqual(outcome, { kind: "auth_failed", message: "Incorrect email or password." });
});

test("interpretLoginAttempt: successful auth without an app_admins row is an authorization error", () => {
  const outcome = interpretLoginAttempt(null, { data: null, error: null });
  assert.equal(outcome.kind, "not_admin");
  if (outcome.kind !== "not_admin") throw new Error("unreachable");
  assert.ok(outcome.message.includes("not registered as an admin"));
  assert.ok(outcome.message.startsWith("Signed in successfully"));
  assert.ok(!/password/i.test(outcome.message));
});

test("interpretLoginAttempt: 42501 app_admins permission failure is an authorization error, never 'incorrect password'", () => {
  const outcome = interpretLoginAttempt(null, {
    data: null,
    error: { message: "permission denied for table app_admins", code: "42501" },
  });
  assert.equal(outcome.kind, "admin_check_failed");
  if (outcome.kind !== "admin_check_failed") throw new Error("unreachable");
  assert.ok(!/incorrect/i.test(outcome.message));
  assert.ok(!/password/i.test(outcome.message));
  assert.ok(outcome.message.startsWith("Signed in successfully"));
  assert.ok(outcome.message.includes("Contact the site operator"));
});

test("interpretLoginAttempt: probe errors never grant admin, even with a row present", () => {
  const outcome = interpretLoginAttempt(null, {
    data: { user_id: ADMIN_USER.id },
    error: { message: "JWT expired" },
  });
  assert.equal(outcome.kind, "admin_check_failed");
});

test("friendlyAuthorizationMessage stays distinct from authentication wording", () => {
  for (const err of [
    { message: "permission denied for table app_admins", code: "42501" },
    { message: "permission denied for table app_admins" },
    { message: "This account is not registered as an admin." },
    new TypeError("Failed to fetch"),
    { message: "unexpected PostgREST failure" },
    null,
  ]) {
    const message = friendlyAuthorizationMessage(err);
    assert.ok(!/incorrect email or password/i.test(message), message);
    assert.ok(!/sign-in failed/i.test(message), message);
    assert.ok(!/secret|stack trace/.test(message), message);
  }
  // And the auth mapper never claims the sign-in succeeded.
  assert.ok(!/signed in/i.test(friendlyAuthMessage({ message: "Invalid login credentials" })));
});

test("friendlyAuthMessage maps Supabase failures to safe wording", () => {
  assert.equal(
    friendlyAuthMessage({ message: "Invalid login credentials" }),
    "Incorrect email or password.",
  );
  assert.equal(
    friendlyAuthMessage({ message: "Email not confirmed" }),
    "This email address has not been confirmed yet.",
  );
  assert.equal(
    friendlyAuthMessage({
      message: "For security purposes, you can only request this after 34 seconds.",
    }),
    "Too many attempts. Please wait a few minutes and try again.",
  );
  assert.equal(
    friendlyAuthMessage({ message: "AuthApiError: Rate limit reached" }),
    "Too many attempts. Please wait a few minutes and try again.",
  );
  assert.equal(
    friendlyAuthMessage(new TypeError("Failed to fetch")),
    "Connection problem. Check your network and try again.",
  );
  assert.equal(
    friendlyAuthMessage({ message: "Something exploded" }),
    "Sign-in failed. Please check your details and try again.",
  );
  assert.equal(
    friendlyAuthMessage(null),
    "Sign-in failed. Please check your details and try again.",
  );
});

test("friendlyAuthMessage never echoes unknown server messages", () => {
  const message = friendlyAuthMessage({ message: "internal stack trace: secret=abc" });
  assert.ok(!message.includes("secret"));
  assert.ok(!message.includes("stack trace"));
});

test("validateNewPassword enforces the project password requirements", () => {
  assert.equal(validateNewPassword("", ""), "Please enter the new password in both fields.");
  assert.equal(
    validateNewPassword("hunter2hunter2", ""),
    "Please enter the new password in both fields.",
  );
  assert.equal(
    validateNewPassword("short", "short"),
    `Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`,
  );
  // Boundary: one below the minimum fails, exactly the minimum passes.
  assert.notEqual(
    validateNewPassword("a".repeat(ADMIN_PASSWORD_MIN_LENGTH - 1), "a".repeat(ADMIN_PASSWORD_MIN_LENGTH - 1)),
    null,
  );
  assert.equal(
    validateNewPassword("a".repeat(ADMIN_PASSWORD_MIN_LENGTH), "a".repeat(ADMIN_PASSWORD_MIN_LENGTH)),
    null,
  );
  assert.equal(validateNewPassword("correcthorse", "differenthorse"), "The passwords do not match.");
});

test("isRecoverySession only accepts recovery-stamped sessions", () => {
  assert.equal(isRecoverySession(null), false);
  assert.equal(isRecoverySession({ user: null }), false);
  assert.equal(isRecoverySession({ user: {} }), false);
  assert.equal(isRecoverySession({ user: { recovery_sent_at: undefined } }), false);
  assert.equal(
    isRecoverySession({ user: { recovery_sent_at: "2026-08-24T10:00:00Z" } }),
    true,
  );
});

test("passwordResetRedirectTo builds the allowlisted reset URL", () => {
  // Canonical site URL wins and is normalized (no trailing slash).
  assert.equal(
    passwordResetRedirectTo("https://spudchallenge.online", "http://localhost:3000"),
    "https://spudchallenge.online/admin/reset-password",
  );
  assert.equal(
    passwordResetRedirectTo("https://spudchallenge.online/", "http://localhost:3000"),
    "https://spudchallenge.online/admin/reset-password",
  );
  // Missing/blank site URL falls back to the current origin (local dev).
  assert.equal(
    passwordResetRedirectTo(undefined, "http://localhost:3000"),
    "http://localhost:3000/admin/reset-password",
  );
  assert.equal(
    passwordResetRedirectTo("   ", "http://localhost:3000"),
    "http://localhost:3000/admin/reset-password",
  );
});

test("friendlyPasswordUpdateMessage maps update failures to safe wording", () => {
  assert.equal(
    friendlyPasswordUpdateMessage({ message: "Rate limit reached" }),
    "Too many attempts. Please wait a few minutes and try again.",
  );
  assert.equal(
    friendlyPasswordUpdateMessage(new TypeError("Failed to fetch")),
    "Connection problem. Check your network and try again.",
  );
  assert.equal(
    friendlyPasswordUpdateMessage({ message: "Password should be at least 6 characters" }),
    `Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`,
  );
  assert.equal(
    friendlyPasswordUpdateMessage({ message: "AuthSessionMissingError: Auth session missing!" }),
    "This reset link is no longer valid. Request a new one from the admin sign-in page and try again.",
  );
  assert.equal(
    friendlyPasswordUpdateMessage({ message: "Something exploded" }),
    "Password update failed. Please try again.",
  );
  assert.equal(
    friendlyPasswordUpdateMessage(null),
    "Password update failed. Please try again.",
  );
});

test("friendlyPasswordUpdateMessage never echoes unknown server messages", () => {
  const message = friendlyPasswordUpdateMessage({ message: "internal stack trace: secret=abc" });
  assert.ok(!message.includes("secret"));
  assert.ok(!message.includes("stack trace"));
});

test("client bundle code never references service-role material", () => {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const forbidden = /service_role|SUPABASE_SERVICE_ROLE_KEY|serviceRole/i;
  const offenders: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      if (!/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) continue;
      const file = join(dir, entry.name);
      if (forbidden.test(readFileSync(file, "utf8"))) offenders.push(file);
    }
  };

  for (const dir of ["app", "components", "hooks", "lib"]) {
    walk(join(root, dir));
  }
  assert.deepEqual(offenders, []);
});
