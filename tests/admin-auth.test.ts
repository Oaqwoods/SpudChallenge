import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { friendlyAuthMessage, interpretAdminProbe } from "../lib/admin-auth.ts";

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
