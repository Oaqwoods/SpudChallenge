// Pure trade-completion logic (playbook prompt 11): client-side validation
// mirroring the publish_trade RPC. Leaf module with no local imports — unit
// tested directly under Node. The trade-update email draft is built by
// lib/broadcast.ts (prompt 12).
//
// The authoritative checks live in the RPC; these exist to give immediate,
// friendly feedback before a round trip.

export const MAX_PUBLIC_IMAGES = 10;

export type BtcSide = "incoming" | "outgoing";

export interface CompletionDraft {
  outgoingItem: string;
  incomingItem: string;
  outgoingValue: number;
  incomingValue: number;
  valuationMethod: string;
  valuationEvidence: string;
  completedAt: string;
  generalLocation: string;
  publicStory: string;
  publicParticipantName: string;
  publicityReleaseConfirmed: boolean;
  mediaCount: number;
  btcSide: BtcSide | null;
  btcAmount: number | null;
  btcUsdValue: number | null;
  btcValuedAt: string | null;
  btcValuationSource: string | null;
  confirmed: boolean;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

// Returns the first problem found, or null when the draft is publishable.
export function validateCompletion(draft: CompletionDraft): string | null {
  if (!draft.outgoingItem.trim()) return "Enter the item given away.";
  if (!draft.incomingItem.trim()) return "Enter the item received.";
  if (!isFiniteNonNegative(draft.outgoingValue)) {
    return "The outgoing value must be a number of zero or more.";
  }
  if (!isFiniteNonNegative(draft.incomingValue)) {
    return "The incoming value must be a number of zero or more.";
  }
  if (!draft.valuationMethod.trim()) return "Enter the valuation method.";
  if (!draft.completedAt) return "Enter the completion date and time.";
  if (!draft.generalLocation.trim()) {
    return "Enter a public general location (city/state or broader).";
  }
  // Prompt 34 case 14: identifiable content needs RECORDED consent. The flag
  // doubles as the attestation for photos — either nobody is identifiable in
  // the media, or a release is on file. Names are additionally enforced by
  // the DB constraint trades_publicity_consent.
  if (
    (draft.publicParticipantName.trim() || draft.mediaCount > 0) &&
    !draft.publicityReleaseConfirmed
  ) {
    return draft.publicParticipantName.trim()
      ? "Confirm the publicity release before publishing a participant name."
      : "Confirm the publicity check before publishing public images.";
  }
  if (draft.mediaCount > MAX_PUBLIC_IMAGES) {
    return `At most ${MAX_PUBLIC_IMAGES} public images are allowed.`;
  }

  if (draft.btcAmount !== null) {
    if (!Number.isFinite(draft.btcAmount) || draft.btcAmount <= 0) {
      return "The BTC amount must be a positive number.";
    }
    if (draft.btcSide === null) {
      return "Choose whether BTC is the incoming or outgoing asset.";
    }
    if (
      draft.btcUsdValue === null ||
      !Number.isFinite(draft.btcUsdValue) ||
      draft.btcUsdValue <= 0 ||
      !draft.btcValuedAt ||
      !(draft.btcValuationSource ?? "").trim()
    ) {
      return "BTC trades need the USD fair-market value, valuation time and source.";
    }
    const frozen = draft.btcSide === "incoming" ? draft.incomingValue : draft.outgoingValue;
    if (frozen !== draft.btcUsdValue) {
      return `The ${draft.btcSide} value must equal the frozen BTC USD fair-market value.`;
    }
  } else if (
    draft.btcUsdValue !== null ||
    draft.btcValuedAt !== null ||
    (draft.btcValuationSource !== null && draft.btcValuationSource.trim() !== "")
  ) {
    return "BTC valuation fields require a BTC amount.";
  }

  if (!draft.confirmed) {
    return "Confirm the real-world transfer actually completed before publishing.";
  }
  return null;
}

