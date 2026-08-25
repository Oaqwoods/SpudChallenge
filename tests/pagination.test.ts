import test from "node:test";
import assert from "node:assert/strict";
import {
  clampPage,
  LIST_PAGE_SIZE,
  pageCount,
  pageSlice,
  pageSummary,
} from "../lib/pagination.ts";

test("pageCount handles empty, exact and partial pages", () => {
  assert.equal(pageCount(0), 1);
  assert.equal(pageCount(-5), 1);
  assert.equal(pageCount(Number.NaN), 1);
  assert.equal(pageCount(1), 1);
  assert.equal(pageCount(LIST_PAGE_SIZE), 1);
  assert.equal(pageCount(LIST_PAGE_SIZE + 1), 2);
  assert.equal(pageCount(312), Math.ceil(312 / LIST_PAGE_SIZE));
  assert.equal(pageCount(10, 3), 4);
});

test("clampPage coerces out-of-range requests", () => {
  assert.equal(clampPage(0, 100), 1);
  assert.equal(clampPage(-2, 100), 1);
  assert.equal(clampPage(Number.NaN, 100), 1);
  assert.equal(clampPage(99, 100), pageCount(100));
  assert.equal(clampPage(2.9, 100), 2, "floors fractional pages");
  assert.equal(clampPage(2, 0), 1, "empty list stays on page 1");
});

test("pageSlice returns the requested window and clamps safely", () => {
  const rows = Array.from({ length: LIST_PAGE_SIZE + 3 }, (_, i) => i);
  assert.equal(pageSlice(rows, 1).length, LIST_PAGE_SIZE);
  assert.deepEqual(pageSlice(rows, 2), [LIST_PAGE_SIZE, LIST_PAGE_SIZE + 1, LIST_PAGE_SIZE + 2]);
  assert.deepEqual(pageSlice(rows, 99), pageSlice(rows, 2), "out-of-range page clamps");
  assert.deepEqual(pageSlice([], 1), []);
});

test("pageSummary describes the visible window", () => {
  assert.equal(pageSummary(0, 1), "0");
  assert.equal(pageSummary(5, 1), `1–5 of 5`);
  assert.equal(pageSummary(LIST_PAGE_SIZE + 3, 2), `${LIST_PAGE_SIZE + 1}–${LIST_PAGE_SIZE + 3} of ${LIST_PAGE_SIZE + 3}`);
  assert.equal(pageSummary(312, 1), `1–${LIST_PAGE_SIZE} of 312`);
});
