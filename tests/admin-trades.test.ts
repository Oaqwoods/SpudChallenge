import test from "node:test";
import assert from "node:assert/strict";
import {
  ACCEPTED_DOCUMENT_MIME,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  documentExtensionFor,
  MAX_DOCUMENT_BYTES,
  toAdminTrade,
  toAdminTradeDocument,
  toAdminTradeMedia,
  tradeValuesChanged,
  validateDocumentFile,
  validateTradeEdit,
  type AdminTradeRow,
  type TradeEditDraft,
} from "../lib/admin-trades.ts";

function trade(overrides: Partial<AdminTradeRow> = {}): AdminTradeRow {
  return {
    id: "t1",
    trade_number: 3,
    created_at: "2026-08-20T12:00:00.000Z",
    published: true,
    published_at: "2026-08-20T12:00:00.000Z",
    completed_at: "2026-08-20T11:00:00.000Z",
    outgoing_item: "One U.S. Dollar",
    outgoing_value: 1,
    incoming_item: "Vintage Guitar Pick",
    incoming_value: 25,
    valuation_status: "estimated",
    valuation_method: "comparable sold listings",
    valuation_evidence: null,
    btc_amount: null,
    btc_usd_value: null,
    btc_valued_at: null,
    btc_valuation_source: null,
    btc_wallet_address: null,
    btc_transaction_id: null,
    public_story: "Traded on the boardwalk.",
    public_participant_name: null,
    publicity_release_confirmed: false,
    general_location: "Austin, TX",
    private_completion_notes: null,
    source_offer_id: "o1",
    updated_at: "2026-08-20T12:00:00.000Z",
    ...overrides,
  };
}

function draft(overrides: Partial<TradeEditDraft> = {}): TradeEditDraft {
  const t = trade();
  return {
    outgoingItem: t.outgoing_item,
    outgoingValue: t.outgoing_value,
    incomingItem: t.incoming_item,
    incomingValue: t.incoming_value,
    valuationMethod: t.valuation_method,
    valuationEvidence: "",
    generalLocation: t.general_location,
    publicStory: t.public_story ?? "",
    publicParticipantName: "",
    publicityReleaseConfirmed: false,
    mediaCount: 0,
    ...overrides,
  };
}

test("toAdminTrade validates rows", () => {
  assert.equal(toAdminTrade({}), null);
  assert.equal(toAdminTrade({ id: "x", trade_number: 0 }), null, "trade number must be positive");
  assert.equal(toAdminTrade({ id: "x", trade_number: 1.5 }), null, "trade number must be integral");
  assert.equal(toAdminTrade({ id: "x", trade_number: "1" }), null, "missing required fields");
  const row = toAdminTrade({
    id: "x",
    trade_number: "4",
    outgoing_item: "Pen",
    incoming_item: "Watch",
    outgoing_value: "2.50",
    incoming_value: 90,
    valuation_method: "comp",
    valuation_status: "verified",
    general_location: "Reno, NV",
    publicity_release_confirmed: true,
    btc_amount: "0.001",
  });
  assert.ok(row);
  assert.equal(row.trade_number, 4);
  assert.equal(row.outgoing_value, 2.5);
  assert.equal(row.valuation_status, "verified");
  assert.equal(row.publicity_release_confirmed, true);
  assert.equal(row.btc_amount, 0.001);
  assert.equal(row.valuation_status, "verified");
});

test("toAdminTrade coerces unknown valuation_status to estimated", () => {
  const row = toAdminTrade({
    id: "x",
    trade_number: 1,
    outgoing_item: "A",
    incoming_item: "B",
    outgoing_value: 1,
    incoming_value: 2,
    valuation_method: "m",
    general_location: "L",
    valuation_status: "something-else",
  });
  assert.equal(row?.valuation_status, "estimated");
});

test("toAdminTradeMedia validates rows", () => {
  assert.equal(toAdminTradeMedia({ id: "m", trade_id: "t" }), null);
  const media = toAdminTradeMedia({
    id: "m",
    trade_id: "t",
    storage_path: "completed/x.jpg",
    sort_order: "2",
  });
  assert.deepEqual(media, {
    id: "m",
    trade_id: "t",
    storage_path: "completed/x.jpg",
    alt_text: null,
    sort_order: 2,
  });
});

test("tradeValuesChanged detects either side", () => {
  const original = trade();
  assert.equal(tradeValuesChanged(original, draft()), false);
  assert.equal(tradeValuesChanged(original, draft({ outgoingValue: 2 })), true);
  assert.equal(tradeValuesChanged(original, draft({ incomingValue: 26 })), true);
});

test("validateTradeEdit enforces the same required fields as publish", () => {
  const original = trade();
  assert.equal(validateTradeEdit(original, draft()), null);
  assert.equal(validateTradeEdit(original, draft({ outgoingItem: "  " })), "Enter the item given away.");
  assert.equal(validateTradeEdit(original, draft({ incomingItem: "" })), "Enter the item received.");
  assert.equal(
    validateTradeEdit(original, draft({ outgoingValue: Number.NaN })),
    "The outgoing value must be a number of zero or more.",
  );
  assert.equal(
    validateTradeEdit(original, draft({ incomingValue: -1 })),
    "The incoming value must be a number of zero or more.",
  );
  assert.equal(validateTradeEdit(original, draft({ valuationMethod: " " })), "Enter the valuation method.");
  assert.equal(
    validateTradeEdit(original, draft({ generalLocation: "" })),
    "Enter a public general location (city/state or broader).",
  );
});

test("validateTradeEdit requires publicity consent for a participant name", () => {
  const original = trade();
  const withName = draft({ publicParticipantName: "Pat R." });
  assert.match(String(validateTradeEdit(original, withName)), /publicity release/i);
  assert.equal(
    validateTradeEdit(original, { ...withName, publicityReleaseConfirmed: true }),
    null,
  );
});

test("validateTradeEdit requires the recorded publicity check when media is present (case 14)", () => {
  const original = trade();
  const withMedia = draft({ mediaCount: 3 });
  assert.match(String(validateTradeEdit(original, withMedia)), /publicity check/i);
  assert.equal(
    validateTradeEdit(original, { ...withMedia, publicityReleaseConfirmed: true }),
    null,
  );
});

test("validateTradeEdit freezes historical values on BTC trades", () => {
  const btcTrade = trade({ btc_amount: 0.01, btc_usd_value: 25, incoming_value: 25 });
  const valueChange = draft({ incomingValue: 30 });
  assert.match(String(validateTradeEdit(btcTrade, valueChange)), /frozen usd fair-market value/i);
  // Text-only edits on a BTC trade remain allowed.
  assert.equal(validateTradeEdit(btcTrade, draft({ publicStory: "typo fixed" })), null);
});

test("document types carry stable labels", () => {
  assert.ok(DOCUMENT_TYPES.length >= 3);
  for (const t of DOCUMENT_TYPES) {
    assert.ok(DOCUMENT_TYPE_LABELS[t].length > 0, `label for ${t}`);
  }
});

test("documentExtensionFor enforces the images + PDF allowlist", () => {
  assert.equal(documentExtensionFor("image/jpeg"), "jpg");
  assert.equal(documentExtensionFor("IMAGE/PNG"), "png", "case-insensitive");
  assert.equal(documentExtensionFor("image/webp"), "webp");
  assert.equal(documentExtensionFor("application/pdf"), "pdf");
  assert.equal(documentExtensionFor("text/html"), null);
  assert.equal(documentExtensionFor("application/x-msdownload"), null);
  assert.equal(documentExtensionFor(null), null);
  assert.equal(Object.keys(ACCEPTED_DOCUMENT_MIME).length, 4);
});

test("validateDocumentFile rejects wrong types, empty and oversized files", () => {
  assert.equal(validateDocumentFile("application/pdf", 1024), null);
  assert.equal(validateDocumentFile("image/jpeg", MAX_DOCUMENT_BYTES), null, "cap is inclusive");
  assert.match(String(validateDocumentFile("text/plain", 1024)), /only jpg, png, webp or pdf/i);
  assert.match(String(validateDocumentFile("application/pdf", 0)), /empty/i);
  assert.match(String(validateDocumentFile("application/pdf", Number.NaN)), /empty/i);
  assert.match(String(validateDocumentFile("application/pdf", MAX_DOCUMENT_BYTES + 1)), /10 mb/i);
});

test("toAdminTradeDocument validates rows", () => {
  assert.equal(toAdminTradeDocument({ id: "d", trade_id: "t" }), null);
  const doc = toAdminTradeDocument({
    id: "d",
    trade_id: "t",
    storage_path: "t/x.pdf",
    document_type: "signed_receipt",
    created_at: "2026-08-25T10:00:00.000Z",
  });
  assert.deepEqual(doc, {
    id: "d",
    trade_id: "t",
    storage_path: "t/x.pdf",
    document_type: "signed_receipt",
    created_at: "2026-08-25T10:00:00.000Z",
  });
});
