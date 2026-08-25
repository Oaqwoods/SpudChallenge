// Pure admin trade-record logic: row validation for the trades list and
// the safe-edit checks for published trades (playbook PROMPT 27). No
// Supabase imports and no local imports — unit tested directly under Node
// (leaf module, like the other node-tested helpers).
//
// The authoritative checks live in the update_published_trade RPC; these
// exist to give immediate, friendly feedback before a round trip.

function toStr(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toNum(value: unknown): number | null {
  const num = typeof value === "string" ? Number(value) : value;
  return typeof num === "number" && Number.isFinite(num) ? num : null;
}

export interface AdminTradeRow {
  id: string;
  trade_number: number;
  created_at: string;
  published: boolean;
  published_at: string | null;
  completed_at: string;
  outgoing_item: string;
  outgoing_value: number;
  incoming_item: string;
  incoming_value: number;
  valuation_status: "estimated" | "verified";
  valuation_method: string;
  valuation_evidence: string | null;
  btc_amount: number | null;
  btc_usd_value: number | null;
  btc_valued_at: string | null;
  btc_valuation_source: string | null;
  btc_wallet_address: string | null;
  btc_transaction_id: string | null;
  public_story: string | null;
  public_participant_name: string | null;
  publicity_release_confirmed: boolean;
  general_location: string;
  private_completion_notes: string | null;
  source_offer_id: string | null;
  updated_at: string;
}

export interface AdminTradeMedia {
  id: string;
  trade_id: string;
  storage_path: string;
  alt_text: string | null;
  sort_order: number;
}

// Validates a raw trades row field by field; null when the row is unusable
// (missing identity or malformed numbers) so bad rows are dropped from the
// list instead of rendering garbage.
export function toAdminTrade(row: Record<string, unknown>): AdminTradeRow | null {
  const id = toStr(row.id);
  if (!id) return null;
  const tradeNumber = toNum(row.trade_number);
  if (tradeNumber === null || tradeNumber <= 0 || !Number.isInteger(tradeNumber)) return null;
  const outgoingValue = toNum(row.outgoing_value);
  const incomingValue = toNum(row.incoming_value);
  const outgoingItem = toStr(row.outgoing_item);
  const incomingItem = toStr(row.incoming_item);
  const valuationMethod = toStr(row.valuation_method);
  const generalLocation = toStr(row.general_location);
  if (outgoingValue === null || incomingValue === null) return null;
  if (!outgoingItem || !incomingItem || !valuationMethod || !generalLocation) return null;
  return {
    id,
    trade_number: tradeNumber,
    created_at: toStr(row.created_at) ?? "",
    published: Boolean(row.published),
    published_at: toStr(row.published_at),
    completed_at: toStr(row.completed_at) ?? "",
    outgoing_item: outgoingItem,
    outgoing_value: outgoingValue,
    incoming_item: incomingItem,
    incoming_value: incomingValue,
    valuation_status: row.valuation_status === "verified" ? "verified" : "estimated",
    valuation_method: valuationMethod,
    valuation_evidence: toStr(row.valuation_evidence),
    btc_amount: toNum(row.btc_amount),
    btc_usd_value: toNum(row.btc_usd_value),
    btc_valued_at: toStr(row.btc_valued_at),
    btc_valuation_source: toStr(row.btc_valuation_source),
    btc_wallet_address: toStr(row.btc_wallet_address),
    btc_transaction_id: toStr(row.btc_transaction_id),
    public_story: toStr(row.public_story),
    public_participant_name: toStr(row.public_participant_name),
    publicity_release_confirmed: Boolean(row.publicity_release_confirmed),
    general_location: generalLocation,
    private_completion_notes: toStr(row.private_completion_notes),
    source_offer_id: toStr(row.source_offer_id),
    updated_at: toStr(row.updated_at) ?? "",
  };
}

export function toAdminTradeMedia(row: Record<string, unknown>): AdminTradeMedia | null {
  const id = toStr(row.id);
  const tradeId = toStr(row.trade_id);
  const storagePath = toStr(row.storage_path);
  const sortOrder = toNum(row.sort_order);
  if (!id || !tradeId || !storagePath || sortOrder === null) return null;
  return {
    id,
    trade_id: tradeId,
    storage_path: storagePath,
    alt_text: toStr(row.alt_text),
    sort_order: sortOrder,
  };
}

// The edit form's draft. Values are numbers (the form converts its string
// inputs before validating).
export interface TradeEditDraft {
  outgoingItem: string;
  outgoingValue: number;
  incomingItem: string;
  incomingValue: number;
  valuationMethod: string;
  valuationEvidence: string;
  generalLocation: string;
  publicStory: string;
  publicParticipantName: string;
  publicityReleaseConfirmed: boolean;
  mediaCount: number;
}

// Historical value changes need an explicit confirmation step (prompt 27) —
// both in the UI and server-side in the RPC.
export function tradeValuesChanged(original: AdminTradeRow, draft: TradeEditDraft): boolean {
  return (
    draft.outgoingValue !== original.outgoing_value ||
    draft.incomingValue !== original.incoming_value
  );
}

// Private verification documents (prompt 29 / spec §8.6): signed receipts,
// agreements, professional verification added by an admin after publication.
// Stored in the private trade-documents bucket, referenced by trade_documents
// rows, never exposed through any public view.

export const DOCUMENT_TYPES = [
  "signed_receipt",
  "agreement",
  "professional_verification",
  "other",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  signed_receipt: "Signed receipt",
  agreement: "Agreement",
  professional_verification: "Professional verification",
  other: "Other",
};

// Images + PDF only; 10 MB matches the bucket-level file_size_limit.
export const ACCEPTED_DOCUMENT_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export function documentExtensionFor(mime: unknown): string | null {
  if (typeof mime !== "string") return null;
  return ACCEPTED_DOCUMENT_MIME[mime.toLowerCase()] ?? null;
}

// Returns the first problem found, or null when the file may be uploaded.
export function validateDocumentFile(fileType: string, sizeBytes: number): string | null {
  if (documentExtensionFor(fileType) === null) {
    return "Only JPG, PNG, WebP or PDF files are accepted.";
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "The file is empty.";
  if (sizeBytes > MAX_DOCUMENT_BYTES) return "Each document must be 10 MB or smaller.";
  return null;
}

export interface AdminTradeDocument {
  id: string;
  trade_id: string;
  storage_path: string;
  document_type: string;
  created_at: string;
}

export function toAdminTradeDocument(row: Record<string, unknown>): AdminTradeDocument | null {
  const id = toStr(row.id);
  const tradeId = toStr(row.trade_id);
  const storagePath = toStr(row.storage_path);
  const documentType = toStr(row.document_type);
  if (!id || !tradeId || !storagePath || !documentType) return null;
  return {
    id,
    trade_id: tradeId,
    storage_path: storagePath,
    document_type: documentType,
    created_at: toStr(row.created_at) ?? "",
  };
}

// Returns the first problem found, or null when the edit can be saved.
export function validateTradeEdit(original: AdminTradeRow, draft: TradeEditDraft): string | null {
  if (!draft.outgoingItem.trim()) return "Enter the item given away.";
  if (!draft.incomingItem.trim()) return "Enter the item received.";
  if (!Number.isFinite(draft.outgoingValue) || draft.outgoingValue < 0) {
    return "The outgoing value must be a number of zero or more.";
  }
  if (!Number.isFinite(draft.incomingValue) || draft.incomingValue < 0) {
    return "The incoming value must be a number of zero or more.";
  }
  if (!draft.valuationMethod.trim()) return "Enter the valuation method.";
  if (!draft.generalLocation.trim()) {
    return "Enter a public general location (city/state or broader).";
  }
  // Prompt 34 case 14 (mirror of the publish gate): recorded consent is
  // required whenever a name or public media is present.
  if (
    (draft.publicParticipantName.trim() || draft.mediaCount > 0) &&
    !draft.publicityReleaseConfirmed
  ) {
    return draft.publicParticipantName.trim()
      ? "Confirm the publicity release before publishing a participant name."
      : "Confirm the publicity check before publishing public images.";
  }
  if (tradeValuesChanged(original, draft) && original.btc_amount !== null) {
    return "BTC trades hold a frozen USD fair-market value; historical values cannot be edited here.";
  }
  return null;
}
