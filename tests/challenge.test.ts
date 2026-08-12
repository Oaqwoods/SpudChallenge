import test from "node:test";
import assert from "node:assert/strict";
import {
  getPhase,
  DEFAULT_SETTINGS,
  type ChallengeSettings,
} from "../lib/challenge.ts";

const START = "2026-08-01T00:00:00Z";
const END = "2026-08-22T00:00:00Z";
const startMs = Date.parse(START);
const endMs = Date.parse(END);

function settings(overrides: Partial<ChallengeSettings>): ChallengeSettings {
  return { ...DEFAULT_SETTINGS, ...overrides };
}

test("null settings reads prelaunch", () => {
  assert.equal(getPhase(null, startMs), "prelaunch");
});

test("no timestamps reads prelaunch", () => {
  assert.equal(getPhase(settings({}), startMs), "prelaunch");
});

test("before start_at reads prelaunch", () => {
  assert.equal(
    getPhase(settings({ start_at: START, end_at: END }), startMs - 1000),
    "prelaunch",
  );
});

test("past start_at reads active even if stored status lags", () => {
  assert.equal(
    getPhase(settings({ start_at: START, end_at: END }), startMs + 1000),
    "active",
  );
});

test("stored active reads active inside the window", () => {
  assert.equal(
    getPhase(settings({ status: "active", start_at: START, end_at: END }), startMs + 5000),
    "active",
  );
});

test("past end_at reads complete regardless of stored status", () => {
  assert.equal(
    getPhase(settings({ status: "active", start_at: START, end_at: END }), endMs + 1000),
    "complete",
  );
});

test("exactly at end_at reads complete", () => {
  assert.equal(
    getPhase(settings({ status: "active", start_at: START, end_at: END }), endMs),
    "complete",
  );
});

test("stored complete is final", () => {
  assert.equal(getPhase(settings({ status: "complete", start_at: START, end_at: END }), startMs), "complete");
});

test("unparseable timestamps fall back to stored status", () => {
  assert.equal(
    getPhase(settings({ status: "active", start_at: "not-a-date" }), startMs),
    "active",
  );
});
