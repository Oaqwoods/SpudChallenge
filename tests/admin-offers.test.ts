import test from "node:test";
import assert from "node:assert/strict";
import {
  DETAIL_ACTIONS,
  LIST_ACTIONS,
  OFFER_STATUSES,
  OFFER_STATUS_LABELS,
  availableActions,
  availableDetailActions,
  canSetDetailStatus,
  canSetStatus,
  canTransition,
  countByStatus,
  filterOffers,
  isOfferStatus,
  isPrelaunchOffer,
  offerIdFromQuery,
  offersLockedBeforeLaunch,
  sortOffers,
  toAdminOffer,
  uuidFromQuery,
  type AdminOfferRow,
} from "../lib/admin-offers.ts";

// The state machine tests below run against a started challenge; the
// prelaunch freeze (prompt 39) has its own tests further down.
const ACTIVE = "active";

function makeOffer(overrides: Partial<AdminOfferRow> = {}): AdminOfferRow {
  return {
    id: "o-1",
    name: "Alice Example",
    email: "alice@example.com",
    phone: null,
    offered_against_trade_number: 1,
    offered_against_item_name: "One U.S. Dollar",
    offered_against_item_value: 1,
    item_name: "Vintage Lamp",
    item_description: "A lamp.",
    claimed_value: 120,
    verified_value: null,
    condition: "Good",
    city: "Austin",
    state: "TX",
    zip: null,
    in_person: true,
    travel_distance: null,
    serial_or_model: null,
    comp_url: null,
    why_good_trade: "Because.",
    status: "new",
    internal_notes: null,
    verification_method: null,
    authenticity_notes: null,
    risk_flags: null,
    contact_notes: null,
    meetup_scheduled_at: null,
    meetup_general_location: null,
    did_not_complete_reason: null,
    last_contacted_at: null,
    created_at: "2026-08-12T12:00:00.000Z",
    ...overrides,
  };
}

const LAMP = makeOffer();
const BIKE = makeOffer({
  id: "o-2",
  item_name: "Bike",
  name: "Bob",
  email: "bob@example.com",
  city: "Denver",
  state: "CO",
  claimed_value: 500,
  status: "shortlisted",
  created_at: "2026-08-12T14:00:00.000Z",
});
const RADIO = makeOffer({
  id: "o-3",
  item_name: "Radio",
  name: "Carol",
  email: "radio@example.com",
  city: "Reno",
  state: "NV",
  claimed_value: 30,
  status: "declined",
  created_at: "2026-08-11T09:00:00.000Z",
});
const ALL = [LAMP, BIKE, RADIO];

test("filterOffers filters by status", () => {
  assert.deepEqual(filterOffers(ALL, { status: "shortlisted", query: "" }), [BIKE]);
  assert.deepEqual(filterOffers(ALL, { status: "all", query: "" }).length, 3);
  assert.deepEqual(filterOffers(ALL, { status: "completed", query: "" }), []);
});

test("filterOffers matches item, name, email, and location case-insensitively", () => {
  assert.deepEqual(filterOffers(ALL, { status: "all", query: "vintage" }), [LAMP]);
  assert.deepEqual(filterOffers(ALL, { status: "all", query: "BOB" }), [BIKE]);
  assert.deepEqual(filterOffers(ALL, { status: "all", query: "alice@" }), [LAMP]);
  assert.deepEqual(filterOffers(ALL, { status: "all", query: "denver" }), [BIKE]);
  assert.deepEqual(filterOffers(ALL, { status: "all", query: "zz-nope" }), []);
});

test("filterOffers combines status and query", () => {
  assert.deepEqual(filterOffers(ALL, { status: "new", query: "austin" }), [LAMP]);
  assert.deepEqual(filterOffers(ALL, { status: "shortlisted", query: "austin" }), []);
});

test("sortOffers orders newest first by default", () => {
  assert.deepEqual(sortOffers(ALL, "newest").map((o) => o.id), ["o-2", "o-1", "o-3"]);
});

test("sortOffers orders by claimed value both directions", () => {
  assert.deepEqual(sortOffers(ALL, "value_desc").map((o) => o.id), ["o-2", "o-1", "o-3"]);
  assert.deepEqual(sortOffers(ALL, "value_asc").map((o) => o.id), ["o-3", "o-1", "o-2"]);
});

test("sortOffers does not mutate its input", () => {
  const input = [RADIO, BIKE, LAMP];
  sortOffers(input, "value_asc");
  assert.deepEqual(input.map((o) => o.id), ["o-3", "o-2", "o-1"]);
});

test("countByStatus tallies the dashboard counters", () => {
  const counts = countByStatus(ALL);
  assert.equal(counts.new, 1);
  assert.equal(counts.shortlisted, 1);
  assert.equal(counts.declined, 1);
  assert.equal(counts.completed, undefined);
});

test("canSetStatus blocks completed offers and no-ops", () => {
  assert.ok(!canSetStatus("completed", "reviewing", ACTIVE));
  assert.ok(!canSetStatus("completed", "declined", ACTIVE));
  assert.ok(!canSetStatus("new", "new", ACTIVE));
});

test("canSetStatus allows the dashboard actions from live states", () => {
  assert.ok(canSetStatus("new", "reviewing", ACTIVE));
  assert.ok(canSetStatus("reviewing", "shortlisted", ACTIVE));
  assert.ok(canSetStatus("shortlisted", "selected", ACTIVE));
  // Re-opening a declined offer is a deliberate admin decision.
  assert.ok(canSetStatus("declined", "reviewing", ACTIVE));
});

test("canSetStatus only targets the quick list actions", () => {
  // meetup_scheduled / did_not_complete / invalid / completed belong to the
  // detail-page workflow (prompt 10+) and the trade workflow (prompt 11).
  assert.ok(!canSetStatus("new", "meetup_scheduled", ACTIVE));
  assert.ok(!canSetStatus("new", "did_not_complete", ACTIVE));
  assert.ok(!canSetStatus("new", "invalid", ACTIVE));
  assert.ok(!canSetStatus("new", "completed", ACTIVE));
});

test("availableActions reflects the current state", () => {
  assert.deepEqual(
    availableActions("new", ACTIVE).map((a) => a.status),
    ["reviewing", "shortlisted", "selected", "declined"],
  );
  assert.deepEqual(availableActions("completed", ACTIVE), []);
  assert.ok(!availableActions("reviewing", ACTIVE).some((a) => a.status === "reviewing"));
});

test("every enum value has a label and LIST_ACTIONS are valid statuses", () => {
  for (const status of OFFER_STATUSES) {
    assert.ok(OFFER_STATUS_LABELS[status], `missing label for ${status}`);
  }
  for (const action of LIST_ACTIONS) {
    assert.ok(isOfferStatus(action.status));
  }
  assert.ok(isOfferStatus("new"));
  assert.ok(!isOfferStatus("accepted"));
  assert.ok(!isOfferStatus(null));
});

test("toAdminOffer coerces PostgREST numerics and rejects bad rows", () => {
  const row = toAdminOffer({
    id: "o-9",
    name: "Carol",
    email: "carol@example.com",
    phone: null,
    offered_against_trade_number: 2,
    offered_against_item_name: "Paperclip",
    offered_against_item_value: "5",
    item_name: "Watch",
    item_description: "A watch.",
    claimed_value: "250.5",
    verified_value: "200",
    condition: "Fair",
    city: "Reno",
    state: "NV",
    zip: null,
    in_person: false,
    travel_distance: null,
    serial_or_model: null,
    comp_url: null,
    why_good_trade: "Why not.",
    status: "new",
    internal_notes: null,
    created_at: "2026-08-12T15:00:00.000Z",
  });
  assert.ok(row);
  assert.equal(row.claimed_value, 250.5);
  assert.equal(row.verified_value, 200);
  assert.equal(row.in_person, false);
  // The offer-to-current-item snapshot (spec §26) is preserved, with the
  // numeric target value coerced from the PostgREST string.
  assert.equal(row.offered_against_trade_number, 2);
  assert.equal(row.offered_against_item_name, "Paperclip");
  assert.equal(row.offered_against_item_value, 5);
  // Prompt-25 trail fields default to null when absent.
  assert.equal(row.meetup_scheduled_at, null);
  assert.equal(row.meetup_general_location, null);
  assert.equal(row.did_not_complete_reason, null);
  assert.equal(row.last_contacted_at, null);

  // Unknown status or missing id are rejected rather than guessed.
  assert.equal(toAdminOffer({ id: "o-10", status: "accepted" }), null);
  assert.equal(toAdminOffer({ status: "new" }), null);
});

const VALID_UUID = "0b5f2f1e-2f3b-4d3a-9f1f-0d0e6b4b1a11";

test("offerIdFromQuery accepts only a canonical uuid in ?id=", () => {
  assert.equal(offerIdFromQuery(`?id=${VALID_UUID}`), VALID_UUID);
  assert.equal(offerIdFromQuery(`?id=${VALID_UUID.toUpperCase()}`), VALID_UUID.toUpperCase());
  assert.equal(offerIdFromQuery(`?other=1&id=${VALID_UUID}`), VALID_UUID);
  assert.equal(offerIdFromQuery("?id=not-a-uuid"), null);
  assert.equal(offerIdFromQuery("?id="), null);
  assert.equal(offerIdFromQuery(""), null);
  assert.equal(offerIdFromQuery(`?id=${VALID_UUID}extra`), null);
});

test("uuidFromQuery reads the requested key only", () => {
  assert.equal(uuidFromQuery(`?offer=${VALID_UUID}`, "offer"), VALID_UUID);
  assert.equal(uuidFromQuery(`?id=${VALID_UUID}`, "offer"), null);
});

test("canTransition enforces the prompt-25 state machine", () => {
  // Forward ladder (jumps allowed) plus exits from live states.
  assert.ok(canTransition("new", "reviewing", ACTIVE));
  assert.ok(canTransition("new", "shortlisted", ACTIVE));
  assert.ok(canTransition("reviewing", "selected", ACTIVE));
  assert.ok(canTransition("shortlisted", "meetup_scheduled", ACTIVE));
  assert.ok(canTransition("meetup_scheduled", "declined", ACTIVE));
  // Walk-away exits exist only after pursuit has started (spec §25).
  assert.ok(canTransition("selected", "did_not_complete", ACTIVE));
  assert.ok(canTransition("meetup_scheduled", "did_not_complete", ACTIVE));
  assert.ok(!canTransition("new", "did_not_complete", ACTIVE));
  assert.ok(!canTransition("reviewing", "did_not_complete", ACTIVE));
  assert.ok(!canTransition("shortlisted", "did_not_complete", ACTIVE));
  // No backward jumps on the ladder.
  assert.ok(!canTransition("meetup_scheduled", "reviewing", ACTIVE));
  assert.ok(!canTransition("selected", "shortlisted", ACTIVE));
  assert.ok(!canTransition("reviewing", "new", ACTIVE));
  // Deliberate re-opens after an ending.
  assert.ok(canTransition("declined", "reviewing", ACTIVE));
  assert.ok(canTransition("did_not_complete", "reviewing", ACTIVE));
  // completed is RPC-only; invalid and completed are terminal.
  for (const from of OFFER_STATUSES) {
    assert.ok(!canTransition(from, "completed", ACTIVE), `${from} -> completed`);
  }
  for (const to of OFFER_STATUSES) {
    assert.ok(!canTransition("invalid", to, ACTIVE), `invalid -> ${to}`);
    assert.ok(!canTransition("completed", to, ACTIVE), `completed -> ${to}`);
  }
});

test("canSetDetailStatus agrees with the matrix and never offers completed", () => {
  assert.ok(canSetDetailStatus("selected", "did_not_complete", ACTIVE));
  assert.ok(canSetDetailStatus("meetup_scheduled", "did_not_complete", ACTIVE));
  assert.ok(!canSetDetailStatus("new", "meetup_scheduled", ACTIVE));
  assert.ok(!canSetDetailStatus("new", "did_not_complete", ACTIVE));
  assert.ok(!canSetDetailStatus("new", "new", ACTIVE));
  assert.ok(!canSetDetailStatus("completed", "reviewing", ACTIVE));
  assert.ok(!canSetDetailStatus("completed", "declined", ACTIVE));
  // completed is reachable only through the trade workflow, never here.
  assert.ok(!DETAIL_ACTIONS.some((a) => a.status === "completed"));
});

test("failed-meetup path: walk away without touching the public challenge", () => {
  // From a scheduled meetup the operator can walk away…
  const fromMeetup = availableDetailActions("meetup_scheduled", ACTIVE).map((a) => a.status);
  assert.ok(fromMeetup.includes("did_not_complete"));
  // …but never publish straight from the offer screen.
  assert.ok(!fromMeetup.includes("completed"));
  // After the walk-away the only way back is a deliberate re-open; the offer
  // cannot jump straight back into the meetup/completion pipeline.
  assert.deepEqual(
    availableDetailActions("did_not_complete", ACTIVE).map((a) => a.status),
    ["reviewing"],
  );
  assert.ok(!canSetDetailStatus("did_not_complete", "meetup_scheduled", ACTIVE));
  assert.ok(!canSetDetailStatus("did_not_complete", "selected", ACTIVE));
});

test("availableDetailActions excludes the current state and locks completed", () => {
  assert.deepEqual(availableDetailActions("completed", ACTIVE), []);
  const fromShortlisted = availableDetailActions("shortlisted", ACTIVE).map((a) => a.status);
  assert.ok(!fromShortlisted.includes("shortlisted"));
  assert.ok(fromShortlisted.includes("meetup_scheduled"));
  // A shortlisted offer has not been pursued yet, so walk-away is not offered.
  assert.ok(!fromShortlisted.includes("did_not_complete"));
});

test("detail actions never use Accept-style final wording", () => {
  for (const action of [...DETAIL_ACTIONS, ...LIST_ACTIONS]) {
    assert.ok(!/accept/i.test(action.label), `forbidden label: ${action.label}`);
  }
});

// Prompt 39: prelaunch Trade #1 offers are COLLECTED ONLY.

test("offersLockedBeforeLaunch locks prelaunch and fails closed", () => {
  assert.equal(offersLockedBeforeLaunch("prelaunch"), true);
  assert.equal(offersLockedBeforeLaunch(null), true);
  assert.equal(offersLockedBeforeLaunch(undefined), true);
  assert.equal(offersLockedBeforeLaunch("something-else"), true);
  assert.equal(offersLockedBeforeLaunch("active"), false);
  assert.equal(offersLockedBeforeLaunch("complete"), false);
});

test("prelaunch freeze: admin cannot select/complete/publish before the challenge starts", () => {
  // No transition out of a collected prelaunch offer — not even
  // reviewing/shortlisting, and never selected/completed/published. The one
  // exception is spam triage (new -> invalid, migration 18).
  for (const to of OFFER_STATUSES) {
    if (to !== "invalid") {
      assert.ok(!canTransition("new", to, "prelaunch"), `new -> ${to} during prelaunch`);
    }
  }
  assert.ok(!canSetStatus("new", "reviewing", "prelaunch"));
  assert.ok(!canSetStatus("new", "shortlisted", "prelaunch"));
  assert.ok(!canSetStatus("new", "selected", "prelaunch"));
  assert.ok(!canSetDetailStatus("new", "selected", "prelaunch"));
  assert.ok(!canSetDetailStatus("new", "meetup_scheduled", "prelaunch"));
  assert.ok(!canSetDetailStatus("new", "declined", "prelaunch"));
  assert.deepEqual(availableActions("new", "prelaunch"), []);
  assert.deepEqual(availableDetailActions("shortlisted", "prelaunch"), []);
  // An unknown/absent challenge status fails closed the same way.
  assert.ok(!canTransition("new", "reviewing", null));
  assert.ok(!canTransition("new", "reviewing"));
  assert.deepEqual(availableActions("new"), []);
});

test("prelaunch spam triage: only new -> invalid stays available", () => {
  assert.ok(canTransition("new", "invalid", "prelaunch"));
  assert.ok(canSetDetailStatus("new", "invalid", "prelaunch"));
  assert.deepEqual(
    availableDetailActions("new", "prelaunch").map((a) => a.status),
    ["invalid"],
  );
  // Not a quick list action — spam triage happens on the offer detail page,
  // exactly as during the active phase.
  assert.ok(!canSetStatus("new", "invalid", "prelaunch"));
  // Spam triage is only allowed from "new" (the only state a prelaunch
  // offer can be in).
  assert.ok(!canTransition("reviewing", "invalid", "prelaunch"));
  assert.ok(!canTransition("shortlisted", "invalid", "prelaunch"));
  // `invalid` stays terminal, so a prelaunch spam exit can never re-enter
  // the trade workflow.
  for (const to of OFFER_STATUSES) {
    assert.ok(!canTransition("invalid", to, "prelaunch"), `invalid -> ${to}`);
    assert.ok(!canTransition("invalid", to, "active"), `invalid -> ${to}`);
  }
});

test("after START CHALLENGE NOW, collected offers enter the normal workflow", () => {
  // Same offers, same snapshot — the freeze simply lifts; no resubmission.
  assert.ok(canTransition("new", "reviewing", "active"));
  assert.ok(canTransition("new", "shortlisted", "active"));
  assert.ok(canTransition("new", "selected", "active"));
  assert.ok(canSetStatus("new", "reviewing", "active"));
  assert.deepEqual(
    availableDetailActions("new", "active").map((a) => a.status),
    ["reviewing", "shortlisted", "selected", "declined", "invalid"],
  );
  // Post-challenge cleanup remains possible after completion too.
  assert.ok(canTransition("new", "declined", "complete"));
});

test("isPrelaunchOffer distinguishes collected offers via created_at vs start_at", () => {
  const startAt = "2026-09-01T00:00:00.000Z";
  assert.equal(isPrelaunchOffer("2026-08-31T23:59:59.999Z", startAt), true);
  assert.equal(isPrelaunchOffer("2026-09-01T00:00:00.000Z", startAt), false);
  assert.equal(isPrelaunchOffer("2026-09-02T12:00:00.000Z", startAt), false);
  // Never started: everything collected so far is prelaunch.
  assert.equal(isPrelaunchOffer("2026-08-31T23:59:59.999Z", null), true);
  assert.equal(isPrelaunchOffer("2026-08-31T23:59:59.999Z", ""), true);
  // Unreadable timestamps: no badge rather than a wrong badge.
  assert.equal(isPrelaunchOffer("not-a-date", startAt), false);
  assert.equal(isPrelaunchOffer("2026-08-31T23:59:59.999Z", "not-a-date"), false);
  assert.equal(isPrelaunchOffer(null, startAt), false);
});
