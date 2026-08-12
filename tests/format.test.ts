import test from "node:test";
import assert from "node:assert/strict";
import { formatUsd, formatSignedUsd, formatMultiplier } from "../lib/format.ts";

test("formatUsd renders whole dollars", () => {
  assert.equal(formatUsd(1400), "$1,400");
  assert.equal(formatUsd(5000000), "$5,000,000");
});

test("formatSignedUsd signs gains and losses", () => {
  assert.equal(formatSignedUsd(550), "+$550");
  assert.equal(formatSignedUsd(-50), "-$50");
  assert.equal(formatSignedUsd(0), "$0");
});

test("formatSignedUsd handles non-finite input", () => {
  assert.equal(formatSignedUsd(Number.NaN), "$0");
});

test("formatMultiplier divides by starting value", () => {
  assert.equal(formatMultiplier(1400, 1), "×1,400");
  assert.equal(formatMultiplier(5.5, 1), "×5.5");
});

test("formatMultiplier guards bad input", () => {
  assert.equal(formatMultiplier(100, 0), "×1");
  assert.equal(formatMultiplier(Number.NaN, 1), "×1");
});
