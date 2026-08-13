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
  countByStatus,
  filterOffers,
  isOfferStatus,
  offerIdFromQuery,
  sortOffers,
  toAdminOffer,
  uuidFromQuery,
  type AdminOfferRow,
} from "../lib/admin-offers.ts";

function makeOffer(overrides: Partial<AdminOfferRow> = {}): AdminOfferRow {
  return {
    id: "o-1",
    name: "Alice Example",
    email: "alice@example.com",
    phone: null,
    offered_against_trade_number: 1,
    offered_against_item_name: "One U.S. Dollar",
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
  assert.ok(!canSetStatus("completed", "reviewing"));
  assert.ok(!canSetStatus("completed", "declined"));
  assert.ok(!canSetStatus("new", "new"));
});

test("canSetStatus allows the dashboard actions from live states", () => {
  assert.ok(canSetStatus("new", "reviewing"));
  assert.ok(canSetStatus("reviewing", "shortlisted"));
  assert.ok(canSetStatus("shortlisted", "selected"));
  // Re-opening a declined offer is a deliberate admin decision.
  assert.ok(canSetStatus("declined", "reviewing"));
});

test("canSetStatus only targets the quick list actions", () => {
  // meetup_scheduled / did_not_complete / invalid / completed belong to the
  // detail-page workflow (prompt 10+) and the trade workflow (prompt 11).
  assert.ok(!canSetStatus("new", "meetup_scheduled"));
  assert.ok(!canSetStatus("new", "did_not_complete"));
  assert.ok(!canSetStatus("new", "invalid"));
  assert.ok(!canSetStatus("new", "completed"));
});

test("availableActions reflects the current state", () => {
  assert.deepEqual(
    availableActions("new").map((a) => a.status),
    ["reviewing", "shortlisted", "selected", "declined"],
  );
  assert.deepEqual(availableActions("completed"), []);
  assert.ok(!availableActions("reviewing").some((a) => a.status === "reviewing"));
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

test("canSetDetailStatus allows the full workflow but not self or completed", () => {
  for (const action of DETAIL_ACTIONS) {
    assert.ok(canSetDetailStatus("new", action.status), `new -> ${action.status}`);
  }
  assert.ok(!canSetDetailStatus("new", "new"));
  assert.ok(!canSetDetailStatus("completed", "reviewing"));
  assert.ok(!canSetDetailStatus("completed", "declined"));
  // completed is reachable only through the trade workflow, never here.
  assert.ok(!DETAIL_ACTIONS.some((a) => a.status === "completed"));
});

test("availableDetailActions excludes the current state and locks completed", () => {
  assert.deepEqual(availableDetailActions("completed"), []);
  const fromShortlisted = availableDetailActions("shortlisted").map((a) => a.status);
  assert.ok(!fromShortlisted.includes("shortlisted"));
  assert.ok(fromShortlisted.includes("meetup_scheduled"));
  assert.ok(fromShortlisted.includes("did_not_complete"));
});

test("detail actions never use Accept-style final wording", () => {
  for (const action of [...DETAIL_ACTIONS, ...LIST_ACTIONS]) {
    assert.ok(!/accept/i.test(action.label), `forbidden label: ${action.label}`);
  }
});
