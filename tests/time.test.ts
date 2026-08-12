import test from "node:test";
import assert from "node:assert/strict";
import { splitDuration, padTwo, compactDuration } from "../lib/time.ts";

test("splitDuration breaks milliseconds into d/h/m/s", () => {
  const ms = (2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000;
  assert.deepEqual(splitDuration(ms), { days: 2, hours: 3, minutes: 4, seconds: 5 });
});

test("splitDuration never goes negative", () => {
  assert.deepEqual(splitDuration(-1000), { days: 0, hours: 0, minutes: 0, seconds: 0 });
});

test("splitDuration floors partial seconds", () => {
  assert.deepEqual(splitDuration(1999), { days: 0, hours: 0, minutes: 0, seconds: 1 });
});

test("padTwo pads single digits only", () => {
  assert.equal(padTwo(5), "05");
  assert.equal(padTwo(12), "12");
});

test("compactDuration renders day/hour/minute", () => {
  assert.equal(compactDuration((86400 + 2 * 3600 + 3 * 60) * 1000), "1d 02h 03m");
});

test("compactDuration clamps at zero", () => {
  assert.equal(compactDuration(-5000), "0d 00h 00m");
});
