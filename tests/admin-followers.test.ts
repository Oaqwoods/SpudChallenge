import test from "node:test";
import assert from "node:assert/strict";
import {
  countGroups,
  filterFollowers,
  isOnWall,
  isOngoing,
  matchesGroup,
  toAdminFollower,
  wallStatus,
  type AdminFollowerRow,
} from "../lib/admin-followers.ts";

function follower(overrides: Partial<AdminFollowerRow> = {}): AdminFollowerRow {
  return {
    id: "f1",
    email: "person@example.com",
    first_name: "Pat",
    email_updates_opt_in: true,
    email_updates_unsubscribed_at: null,
    trade_interest: false,
    public_wall_opt_in: false,
    public_display_name: null,
    public_general_location: null,
    public_visible: true,
    created_at: "2026-08-21T12:00:00.000Z",
    ...overrides,
  };
}

test("toAdminFollower validates rows", () => {
  assert.equal(toAdminFollower({}), null);
  assert.equal(toAdminFollower({ id: "x" }), null, "missing email");
  const row = toAdminFollower({
    id: "x",
    email: "a@b.co",
    public_visible: false,
    email_updates_opt_in: "t",
  });
  assert.ok(row);
  assert.equal(row.public_visible, false);
  assert.equal(row.email_updates_opt_in, true);
});

test("isOngoing requires opt-in without unsubscribe", () => {
  assert.equal(isOngoing(follower()), true);
  assert.equal(isOngoing(follower({ email_updates_opt_in: false })), false);
  assert.equal(
    isOngoing(follower({ email_updates_unsubscribed_at: "2026-08-21T13:00:00.000Z" })),
    false,
  );
});

test("group filters and counts match the three audience definitions", () => {
  const rows = [
    follower({ id: "a" }), // ongoing only
    follower({ id: "b", email_updates_opt_in: false, trade_interest: true }), // trade lead only
    follower({ id: "c", trade_interest: true }), // both
    follower({
      id: "d",
      trade_interest: true,
      email_updates_unsubscribed_at: "2026-08-21T13:00:00.000Z",
    }), // unsubscribed trade lead
  ];
  const counts = countGroups(rows);
  assert.deepEqual(counts, { all: 4, ongoing: 2, trade_interest: 3, both: 1 });
  assert.deepEqual(
    filterFollowers(rows, "ongoing").map((f) => f.id),
    ["a", "c"],
  );
  assert.deepEqual(
    filterFollowers(rows, "trade_interest").map((f) => f.id),
    ["b", "c", "d"],
  );
  assert.deepEqual(
    filterFollowers(rows, "both").map((f) => f.id),
    ["c"],
  );
  assert.equal(matchesGroup(rows[3], "both"), false, "unsubscribed is not in both");
  assert.equal(filterFollowers(rows, "all").length, 4);
});

test("isOnWall mirrors the public_follower_wall view", () => {
  const base = follower({
    public_wall_opt_in: true,
    public_display_name: "Pat P.",
  });
  assert.equal(isOnWall(base), true);
  assert.equal(isOnWall({ ...base, public_visible: false }), false, "admin-hidden");
  assert.equal(
    isOnWall({ ...base, email_updates_unsubscribed_at: "2026-08-21T13:00:00.000Z" }),
    false,
    "unsubscribed",
  );
  assert.equal(isOnWall({ ...base, email_updates_opt_in: false }), false, "no email opt-in");
  assert.equal(isOnWall({ ...base, public_wall_opt_in: false }), false, "no wall opt-in");
  assert.equal(isOnWall({ ...base, public_display_name: null }), false, "no display name");
});

test("wallStatus explains every state", () => {
  assert.equal(wallStatus(follower()), "Not on wall");
  assert.equal(
    wallStatus(follower({ email_updates_unsubscribed_at: "2026-08-21T13:00:00.000Z" })),
    "Unsubscribed",
  );
  assert.equal(wallStatus(follower({ email_updates_opt_in: false })), "No email opt-in");
  const onWall = follower({ public_wall_opt_in: true, public_display_name: "Pat" });
  assert.equal(wallStatus(onWall), "On wall");
  assert.equal(wallStatus({ ...onWall, public_visible: false }), "Hidden");
});
