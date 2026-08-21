import test from "node:test";
import assert from "node:assert/strict";
import {
  CHALLENGE_DURATION_MS,
  buildSettingsUpdate,
  canStartChallenge,
  computeLaunchWindow,
  datetimeLocalToIso,
  draftFromSettings,
  isoToDatetimeLocal,
  validateSettingsDraft,
} from "../lib/admin-settings.ts";
import { DEFAULT_SETTINGS } from "../lib/challenge.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

test("challenge duration is exactly 21 days", () => {
  assert.equal(CHALLENGE_DURATION_MS, 21 * DAY_MS);
});

test("computeLaunchWindow starts now and ends 21 days later", () => {
  const nowMs = Date.parse("2026-09-01T15:30:00.000Z");
  const window = computeLaunchWindow(nowMs);
  assert.equal(window.start_at, "2026-09-01T15:30:00.000Z");
  assert.equal(window.end_at, "2026-09-22T15:30:00.000Z");
});

test("canStartChallenge only before the first start", () => {
  assert.equal(canStartChallenge(DEFAULT_SETTINGS), true);
  assert.equal(
    canStartChallenge({ ...DEFAULT_SETTINGS, status: "active" }),
    false,
    "already active",
  );
  assert.equal(
    canStartChallenge({ ...DEFAULT_SETTINGS, start_at: "2026-09-01T00:00:00.000Z" }),
    false,
    "start date already set",
  );
  assert.equal(
    canStartChallenge({ ...DEFAULT_SETTINGS, status: "complete" }),
    false,
    "already complete",
  );
});

test("datetime-local conversion round-trips and handles empties", () => {
  const sample = "2026-09-01T09:30";
  const iso = datetimeLocalToIso(sample);
  assert.ok(iso, "a valid datetime-local value converts to ISO");
  assert.equal(isoToDatetimeLocal(iso), sample);
  assert.equal(datetimeLocalToIso(""), null);
  assert.equal(datetimeLocalToIso("not-a-date"), null);
  assert.equal(isoToDatetimeLocal(null), "");
  assert.equal(isoToDatetimeLocal("not-an-iso"), "");
});

function validDraft() {
  return draftFromSettings(DEFAULT_SETTINGS);
}

test("validateSettingsDraft accepts the seeded draft", () => {
  assert.equal(validateSettingsDraft(validDraft()), null);
});

test("validateSettingsDraft enforces the DB constraints", () => {
  assert.match(validateSettingsDraft({ ...validDraft(), title: "  " }) ?? "", /title/i);
  assert.match(
    validateSettingsDraft({ ...validDraft(), current_item_name: "" }) ?? "",
    /current item name/i,
  );
  assert.match(
    validateSettingsDraft({ ...validDraft(), starting_value: "-5" }) ?? "",
    /starting value/i,
  );
  assert.match(validateSettingsDraft({ ...validDraft(), target_value: "0" }) ?? "", /target/i);
  assert.match(
    validateSettingsDraft({ ...validDraft(), current_item_value: "abc" }) ?? "",
    /current item value/i,
  );
  assert.match(
    validateSettingsDraft({
      ...validDraft(),
      start_local: "2026-09-02T09:00",
      end_local: "2026-09-01T09:00",
    }) ?? "",
    /end date must be after/i,
  );
});

test("buildSettingsUpdate produces the storage payload", () => {
  const draft = {
    ...validDraft(),
    start_local: "2026-09-01T09:00",
    end_local: "",
    current_item_description: "  ",
    current_item_general_location: " Springfield ",
  };
  const update = buildSettingsUpdate(draft);
  assert.equal(update.title, "ONE → FIVE");
  assert.equal(update.starting_value, 1);
  assert.equal(update.target_value, 5000000);
  assert.equal(typeof update.start_at, "string");
  assert.equal(update.end_at, null);
  assert.equal(update.current_item_description, null);
  assert.equal(update.current_item_general_location, "Springfield");
  assert.equal(update.status, "prelaunch");
});
