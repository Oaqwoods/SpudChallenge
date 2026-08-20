import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PUBLIC_IMAGES,
  validateCompletion,
  type CompletionDraft,
} from "../lib/publish-trade.ts";

function validDraft(overrides: Partial<CompletionDraft> = {}): CompletionDraft {
  return {
    outgoingItem: "One U.S. Dollar",
    incomingItem: "Paperclip",
    outgoingValue: 1,
    incomingValue: 5,
    valuationMethod: "Comparable listings",
    valuationEvidence: "eBay sold listings",
    completedAt: "2026-08-13T12:00",
    generalLocation: "Austin, TX",
    publicStory: "A classic first trade.",
    publicParticipantName: "",
    publicityReleaseConfirmed: false,
    mediaCount: 1,
    btcSide: null,
    btcAmount: null,
    btcUsdValue: null,
    btcValuedAt: null,
    btcValuationSource: null,
    confirmed: true,
    ...overrides,
  };
}

test("validateCompletion accepts a complete draft", () => {
  assert.equal(validateCompletion(validDraft()), null);
});

test("validateCompletion enforces the required public fields", () => {
  assert.match(validateCompletion(validDraft({ outgoingItem: "  " })) ?? "", /item given away/);
  assert.match(validateCompletion(validDraft({ incomingItem: "" })) ?? "", /item received/);
  assert.match(validateCompletion(validDraft({ outgoingValue: Number.NaN })) ?? "", /outgoing value/);
  assert.match(validateCompletion(validDraft({ incomingValue: -1 })) ?? "", /incoming value/);
  assert.match(validateCompletion(validDraft({ valuationMethod: "" })) ?? "", /valuation method/);
  assert.match(validateCompletion(validDraft({ completedAt: "" })) ?? "", /date and time/);
  assert.match(validateCompletion(validDraft({ generalLocation: " " })) ?? "", /general location/);
});

test("validateCompletion requires publicity consent for a participant name", () => {
  const withName = validDraft({ publicParticipantName: "Spud" });
  assert.match(validateCompletion(withName) ?? "", /publicity release/);
  assert.equal(
    validateCompletion(validDraft({ publicParticipantName: "Spud", publicityReleaseConfirmed: true })),
    null,
  );
});

test("validateCompletion caps public images", () => {
  assert.match(
    validateCompletion(validDraft({ mediaCount: MAX_PUBLIC_IMAGES + 1 })) ?? "",
    /At most/,
  );
  assert.equal(validateCompletion(validDraft({ mediaCount: MAX_PUBLIC_IMAGES })), null);
});

test("validateCompletion enforces the Bitcoin exception", () => {
  // BTC amount without a side is incomplete.
  assert.match(
    validateCompletion(validDraft({ btcAmount: 0.001 })) ?? "",
    /incoming or outgoing/,
  );
  // Missing valuation data.
  assert.match(
    validateCompletion(validDraft({ btcAmount: 0.001, btcSide: "incoming" })) ?? "",
    /fair-market value/,
  );
  // Frozen value must equal the BTC USD FMV on the BTC side.
  const btcBase = {
    btcAmount: 0.001,
    btcSide: "incoming" as const,
    btcUsdValue: 1200,
    btcValuedAt: "2026-08-13T11:00",
    btcValuationSource: "Coinbase spot",
  };
  assert.match(
    validateCompletion(validDraft({ ...btcBase, incomingValue: 999 })) ?? "",
    /must equal the frozen/,
  );
  assert.equal(validateCompletion(validDraft({ ...btcBase, incomingValue: 1200 })), null);
  // Outgoing side checks the outgoing value instead.
  const outgoing = { ...btcBase, btcSide: "outgoing" as const };
  assert.match(
    validateCompletion(validDraft({ ...outgoing, outgoingValue: 1 })) ?? "",
    /must equal the frozen/,
  );
  assert.equal(
    validateCompletion(validDraft({ ...outgoing, outgoingValue: 1200 })),
    null,
  );
  // Valuation fields without an amount are rejected.
  assert.match(
    validateCompletion(validDraft({ btcUsdValue: 500 })) ?? "",
    /require a BTC amount/,
  );
});

test("validateCompletion requires the real-transfer confirmation", () => {
  assert.match(validateCompletion(validDraft({ confirmed: false })) ?? "", /confirm/i);
});

