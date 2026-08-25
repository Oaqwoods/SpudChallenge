import test from "node:test";
import assert from "node:assert/strict";
import {
  CHALLENGE_DURATION_MS,
  buildPauseUpdate,
  buildSettingsUpdate,
  canStartChallenge,
  computeLaunchWindow,
  datetimeLocalToIso,
  draftFromSettings,
  isoToDatetimeLocal,
  pauseDraftFromSettings,
  PUBLIC_NOTICE_MAX,
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

test("buildSettingsUpdate never writes the pause columns", () => {
  const update = buildSettingsUpdate(draftFromSettings(DEFAULT_SETTINGS));
  assert.equal("offers_paused" in update, false);
  assert.equal("follower_signups_paused" in update, false);
  assert.equal("public_notice" in update, false);
});

test("pauseDraftFromSettings mirrors the stored pause state", () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    offers_paused: true,
    follower_signups_paused: false,
    public_notice: "Back soon",
  };
  assert.deepEqual(pauseDraftFromSettings(settings), {
    offers_paused: true,
    follower_signups_paused: false,
    public_notice: "Back soon",
  });
  assert.equal(pauseDraftFromSettings(DEFAULT_SETTINGS).public_notice, "");
});

test("buildPauseUpdate writes only the three pause columns, trimmed and capped", () => {
  const update = buildPauseUpdate({
    offers_paused: true,
    follower_signups_paused: true,
    public_notice: `  ${"n".repeat(PUBLIC_NOTICE_MAX + 100)}  `,
  });
  assert.deepEqual(Object.keys(update).sort(), [
    "follower_signups_paused",
    "offers_paused",
    "public_notice",
  ]);
  assert.equal(update.offers_paused, true);
  assert.equal(update.follower_signups_paused, true);
  assert.equal((update.public_notice as string).length, PUBLIC_NOTICE_MAX);
  assert.equal(
    buildPauseUpdate({ offers_paused: false, follower_signups_paused: false, public_notice: "   " })
      .public_notice,
    null,
    "blank notice clears the hero banner",
  );
});
