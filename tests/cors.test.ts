import test from "node:test";
import assert from "node:assert/strict";
import { isOriginAllowed, corsHeaders } from "../supabase/functions/_shared/cors.ts";

test("allowlist accepts exactly the application origins", () => {
  assert.ok(isOriginAllowed("https://spudchallenge.online"));
  assert.ok(isOriginAllowed("https://oaqwoods.github.io"));
  assert.ok(isOriginAllowed("http://localhost:3000"));
});

test("allowlist rejects foreign and near-miss origins", () => {
  assert.ok(!isOriginAllowed("https://evil.example.com"));
  assert.ok(!isOriginAllowed("https://someoneelse.github.io"));
  assert.ok(!isOriginAllowed("https://oaqwoods.github.io.evil.com"));
  assert.ok(!isOriginAllowed("http://spudchallenge.online")); // wrong scheme
  assert.ok(!isOriginAllowed("https://spudchallenge.online/")); // trailing slash
});

test("corsHeaders reflects allowed origins and never emits a wildcard", () => {
  assert.equal(
    corsHeaders("https://oaqwoods.github.io")["access-control-allow-origin"],
    "https://oaqwoods.github.io",
  );
  // Disallowed/missing origins fall back to the fixed production origin —
  // never reflected, never "*".
  assert.equal(
    corsHeaders("https://evil.example.com")["access-control-allow-origin"],
    "https://spudchallenge.online",
  );
  assert.equal(
    corsHeaders(null)["access-control-allow-origin"],
    "https://spudchallenge.online",
  );
  for (const origin of ["https://oaqwoods.github.io", "https://evil.example.com", null]) {
    assert.notEqual(corsHeaders(origin)["access-control-allow-origin"], "*");
  }
});
