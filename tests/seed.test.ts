import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { DEFAULT_SETTINGS } from "../lib/challenge.ts";

const SEED_FILES = [
  "supabase/migrations/20260812000004_seed.sql",
  "supabase/migrations/20260821000009_seed_initial_challenge.sql",
];

test("frontend defaults match the prompt-19 initial challenge state", () => {
  assert.equal(DEFAULT_SETTINGS.title, "ONE → FIVE");
  assert.equal(DEFAULT_SETTINGS.subtitle, "$1 → $5,000,000 in 21 Days");
  assert.equal(DEFAULT_SETTINGS.starting_value, 1);
  assert.equal(DEFAULT_SETTINGS.target_value, 5000000);
  assert.equal(DEFAULT_SETTINGS.status, "prelaunch");
  assert.equal(DEFAULT_SETTINGS.current_item_name, "One U.S. Dollar");
  assert.equal(DEFAULT_SETTINGS.current_item_value, 1);
  assert.equal(DEFAULT_SETTINGS.current_trade_number, 0);
  assert.equal(DEFAULT_SETTINGS.start_at, null);
  assert.equal(DEFAULT_SETTINGS.end_at, null);
  assert.equal(DEFAULT_SETTINGS.current_item_image_path, null);
});

test("placeholder image ships with the repo", () => {
  assert.ok(
    existsSync(new URL("../public/images/current-item-placeholder.png", import.meta.url)),
    "public/images/current-item-placeholder.png must exist",
  );
});

for (const file of SEED_FILES) {
  test(`seed migration is canonical and safe: ${file}`, () => {
    const sql = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const insert = sql.slice(sql.indexOf("insert into"), sql.lastIndexOf("on conflict"));
    assert.ok(insert.includes("'ONE → FIVE'"), "title");
    assert.ok(insert.includes("'$1 → $5,000,000 in 21 Days'"), "subtitle");
    assert.ok(insert.includes("'prelaunch'"), "status");
    assert.ok(insert.includes("'One U.S. Dollar'"), "current item");
    assert.ok(insert.includes("5000000"), "target value");
    assert.ok(!insert.includes("start_at"), "never hardcodes start_at");
    assert.ok(!insert.includes("end_at"), "never hardcodes end_at");
    assert.ok(sql.includes("on conflict (id) do nothing"), "idempotent");
  });
}
