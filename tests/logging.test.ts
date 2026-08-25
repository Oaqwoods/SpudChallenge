import test from "node:test";
import assert from "node:assert/strict";
import { errorMessage } from "../supabase/functions/_shared/logging.ts";

test("errorMessage keeps only the message text of Error instances", () => {
  assert.equal(errorMessage(new Error("boom")), "boom");
  assert.equal(errorMessage(new TypeError("bad type")), "bad type");
});

test("errorMessage never leaks PostgREST details (e.g. emails in duplicate-key DETAIL)", () => {
  // Shape of a supabase-js PostgrestError on a unique-constraint violation:
  // message is constraint text; details carries "Key (email)=(...) ...".
  class PostgrestError extends Error {
    details: string;
    hint: string | null;
    code: string;
    constructor(init: { message: string; details: string; hint: string | null; code: string }) {
      super(init.message);
      this.details = init.details;
      this.hint = init.hint;
      this.code = init.code;
    }
  }
  const err = new PostgrestError({
    message: 'duplicate key value violates unique constraint "followers_email_key"',
    details: "Key (email)=(person@example.com) already exists.",
    hint: null,
    code: "23505",
  });
  const logged = errorMessage(err);
  assert.equal(logged, 'duplicate key value violates unique constraint "followers_email_key"');
  assert.ok(!logged.includes("person@example.com"), "email must not reach the logs");
  assert.ok(!logged.includes("details"), "details field must not be serialized");
});

test("errorMessage reads plain objects with a message field (non-Error throws)", () => {
  assert.equal(errorMessage({ message: "storage offline", details: "Key (email)=(x@y.z)" }), "storage offline");
});

test("errorMessage passes through strings and falls back safely", () => {
  assert.equal(errorMessage("plain string failure"), "plain string failure");
  assert.equal(errorMessage(undefined), "unknown error");
  assert.equal(errorMessage(null), "unknown error");
  assert.equal(errorMessage(42), "unknown error");
  assert.equal(errorMessage({ code: "23505" }), "unknown error");
});
