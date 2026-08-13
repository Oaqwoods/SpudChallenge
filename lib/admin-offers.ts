// Pure admin offer-list logic: filtering, sorting, counting, status
// transition rules, and row coercion. No Supabase imports and no local
// imports — unit tested directly under Node (leaf module, like the other
// node-tested helpers).

function toNum(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toStr(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export const OFFER_STATUSES = [
  "new",
  "reviewing",
  "shortlisted",
  "selected",
  "meetup_scheduled",
  "declined",
  "did_not_complete",
  "completed",
  "invalid",
] as const;

export type OfferStatus = (typeof OFFER_STATUSES)[number];

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  new: "New",
  reviewing: "Reviewing",
  shortlisted: "Shortlisted",
  selected: "Selected",
  meetup_scheduled: "Meetup Scheduled",
  declined: "Declined",
  did_not_complete: "Did Not Complete",
  completed: "Completed",
  invalid: "Invalid / Spam",
};

// Quick status changes available from the dashboard list (playbook prompt 9).
export const LIST_ACTIONS: ReadonlyArray<{ status: OfferStatus; label: string }> = [
  { status: "reviewing", label: "Review" },
  { status: "shortlisted", label: "Shortlist" },
  { status: "selected", label: "Select" },
  { status: "declined", label: "Decline" },
];

// Full workflow actions on the offer detail page (playbook prompt 10).
// Deliberately no "Accept" — nothing here ends the workflow, and selecting
// or scheduling never changes the public challenge.
export const DETAIL_ACTIONS: ReadonlyArray<{ status: OfferStatus; label: string }> = [
  { status: "reviewing", label: "Reopen Review" },
  { status: "shortlisted", label: "Shortlist" },
  { status: "selected", label: "Select for Verification" },
  { status: "meetup_scheduled", label: "Schedule Meetup" },
  { status: "declined", label: "Decline" },
  { status: "did_not_complete", label: "Did Not Complete" },
  { status: "invalid", label: "Invalid / Spam" },
];

export function isOfferStatus(value: unknown): value is OfferStatus {
  return typeof value === "string" && (OFFER_STATUSES as readonly string[]).includes(value);
}

export interface AdminOfferRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  offered_against_trade_number: number;
  offered_against_item_name: string;
  item_name: string;
  item_description: string;
  claimed_value: number;
  verified_value: number | null;
  condition: string;
  city: string;
  state: string;
  zip: string | null;
  in_person: boolean;
  travel_distance: string | null;
  serial_or_model: string | null;
  comp_url: string | null;
  why_good_trade: string;
  status: OfferStatus;
  internal_notes: string | null;
  verification_method: string | null;
  authenticity_notes: string | null;
  risk_flags: string | null;
  contact_notes: string | null;
  meetup_scheduled_at: string | null;
  meetup_general_location: string | null;
  did_not_complete_reason: string | null;
  created_at: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Extracts and validates ?id= from the detail-page URL. Static hosting has
// no dynamic routes, so the offer id travels as a query parameter.
export function offerIdFromQuery(search: string): string | null {
  const params = new URLSearchParams(search);
  const id = params.get("id");
  return id !== null && UUID_RE.test(id) ? id : null;
}

// Coerce a raw PostgREST row. `numeric` columns arrive as strings and
// unknown statuses are rejected rather than guessed.
export function toAdminOffer(row: Record<string, unknown>): AdminOfferRow | null {
  if (typeof row.id !== "string" || !isOfferStatus(row.status)) return null;
  return {
    id: row.id,
    name: toStr(row.name) ?? "",
    email: toStr(row.email) ?? "",
    phone: toStr(row.phone),
    offered_against_trade_number: toNum(row.offered_against_trade_number),
    offered_against_item_name: toStr(row.offered_against_item_name) ?? "",
    item_name: toStr(row.item_name) ?? "",
    item_description: toStr(row.item_description) ?? "",
    claimed_value: toNum(row.claimed_value),
    verified_value: row.verified_value == null ? null : toNum(row.verified_value),
    condition: toStr(row.condition) ?? "",
    city: toStr(row.city) ?? "",
    state: toStr(row.state) ?? "",
    zip: toStr(row.zip),
    in_person: Boolean(row.in_person),
    travel_distance: toStr(row.travel_distance),
    serial_or_model: toStr(row.serial_or_model),
    comp_url: toStr(row.comp_url),
    why_good_trade: toStr(row.why_good_trade) ?? "",
    status: row.status,
    internal_notes: toStr(row.internal_notes),
    verification_method: toStr(row.verification_method),
    authenticity_notes: toStr(row.authenticity_notes),
    risk_flags: toStr(row.risk_flags),
    contact_notes: toStr(row.contact_notes),
    meetup_scheduled_at: toStr(row.meetup_scheduled_at),
    meetup_general_location: toStr(row.meetup_general_location),
    did_not_complete_reason: toStr(row.did_not_complete_reason),
    created_at: toStr(row.created_at) ?? "",
  };
}

export type OfferSort = "newest" | "value_desc" | "value_asc";

export const OFFER_SORT_LABELS: Record<OfferSort, string> = {
  newest: "Newest",
  value_desc: "Claimed value (high → low)",
  value_asc: "Claimed value (low → high)",
};

export interface OfferListFilter {
  status: OfferStatus | "all";
  query: string;
}

const SEARCH_FIELDS: ReadonlyArray<(row: AdminOfferRow) => string | null> = [
  (r) => r.item_name,
  (r) => r.name,
  (r) => r.email,
  (r) => r.city,
  (r) => r.state,
];

export function filterOffers(rows: AdminOfferRow[], filter: OfferListFilter): AdminOfferRow[] {
  const query = filter.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.status !== "all" && row.status !== filter.status) return false;
    if (query.length === 0) return true;
    return SEARCH_FIELDS.some((field) => (field(row) ?? "").toLowerCase().includes(query));
  });
}

export function sortOffers(rows: AdminOfferRow[], sort: OfferSort): AdminOfferRow[] {
  const sorted = [...rows];
  if (sort === "value_desc") {
    sorted.sort((a, b) => b.claimed_value - a.claimed_value);
  } else if (sort === "value_asc") {
    sorted.sort((a, b) => a.claimed_value - b.claimed_value);
  } else {
    sorted.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  }
  return sorted;
}

export function countByStatus(rows: AdminOfferRow[]): Partial<Record<OfferStatus, number>> {
  const counts: Partial<Record<OfferStatus, number>> = {};
  for (const row of rows) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}

// Offers that already completed their real-world transfer are locked from
// quick list actions: their outcome moves through the trade workflow instead.
export function canSetStatus(from: OfferStatus, to: OfferStatus): boolean {
  if (from === to) return false;
  if (from === "completed") return false;
  return LIST_ACTIONS.some((action) => action.status === to);
}

export function availableActions(from: OfferStatus): ReadonlyArray<{ status: OfferStatus; label: string }> {
  return LIST_ACTIONS.filter((action) => canSetStatus(from, action.status));
}

// Detail-page transitions: the full action set minus the current state.
// Completed offers stay locked — their outcome moves through the trade
// workflow (playbook prompt 11). Nothing here touches the public challenge.
export function canSetDetailStatus(from: OfferStatus, to: OfferStatus): boolean {
  if (from === to) return false;
  if (from === "completed") return false;
  return DETAIL_ACTIONS.some((action) => action.status === to);
}

export function availableDetailActions(from: OfferStatus): ReadonlyArray<{ status: OfferStatus; label: string }> {
  return DETAIL_ACTIONS.filter((action) => canSetDetailStatus(from, action.status));
}
