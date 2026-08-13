// Pure trade-completion logic (playbook prompt 11): client-side validation
// mirroring the publish_trade RPC, and the draft broadcast builder. Leaf
// module with no local imports — unit tested directly under Node.
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
  if (draft.publicParticipantName.trim() && !draft.publicityReleaseConfirmed) {
    return "Confirm the publicity release before publishing a participant name.";
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

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatUsdForEmail(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export interface DraftEmailInput {
  tradeNumber: number;
  outgoingItem: string;
  outgoingValue: number;
  incomingItem: string;
  incomingValue: number;
  story: string | null;
  siteUrl: string;
}

// Draft broadcast stored by the publish RPC. Prompt 12 adds editing, preview
// and sending — drafts are never auto-sent.
export function buildDraftEmail(input: DraftEmailInput): {
  subject: string;
  body_html: string;
} {
  const subject = `TRADE #${input.tradeNumber}: ${formatUsdForEmail(input.outgoingValue)} → ${formatUsdForEmail(input.incomingValue)}`;
  const story = input.story?.trim() ? `<p>${escapeHtml(input.story.trim())}</p>` : "";
  const body_html = [
    `<p>Trade #${input.tradeNumber} is complete.</p>`,
    `<p>We traded <strong>${escapeHtml(input.outgoingItem)}</strong> (${formatUsdForEmail(input.outgoingValue)}) for <strong>${escapeHtml(input.incomingItem)}</strong> (${formatUsdForEmail(input.incomingValue)}).</p>`,
    story,
    `<p><a href="${escapeHtml(input.siteUrl)}">Follow the challenge</a></p>`,
  ].join("\n");
  return { subject, body_html };
}
