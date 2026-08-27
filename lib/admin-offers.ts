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
// or scheduling never changes the public challenge. Which of these are
// offered depends on the transition matrix below (prompt 25).
export const DETAIL_ACTIONS: ReadonlyArray<{ status: OfferStatus; label: string }> = [
  { status: "reviewing", label: "Start / Reopen Review" },
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
  offered_against_item_value: number;
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
  last_contacted_at: string | null;
  created_at: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Extracts and validates a uuid query parameter. Static hosting has no
// dynamic routes, so ids travel as query parameters.
export function uuidFromQuery(search: string, key: string): string | null {
  const params = new URLSearchParams(search);
  const id = params.get(key);
  return id !== null && UUID_RE.test(id) ? id : null;
}

export function offerIdFromQuery(search: string): string | null {
  return uuidFromQuery(search, "id");
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
    offered_against_item_value: toNum(row.offered_against_item_value),
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
    last_contacted_at: toStr(row.last_contacted_at),
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

// The offer state machine (playbook prompt 25 / build spec §25). Forward
// movement down the ladder (forward jumps allowed — a great offer may skip
// reviewing), walk-away exits once pursuit has started, decline/invalid from
// any live state, and deliberate re-opens from declined / did_not_complete.
// `completed` is intentionally absent: it is reachable only through the
// publish_trade RPC, which independently requires selected/meetup_scheduled
// plus the explicit real-transfer confirmation. `invalid` and `completed`
// are terminal. The database enforces the same matrix with a trigger
// (migration 10), so this guard is the UI's first line, not the last.
export const OFFER_TRANSITIONS: Record<OfferStatus, readonly OfferStatus[]> = {
  new: ["reviewing", "shortlisted", "selected", "declined", "invalid"],
  reviewing: ["shortlisted", "selected", "declined", "invalid"],
  shortlisted: ["selected", "meetup_scheduled", "declined", "invalid"],
  selected: ["meetup_scheduled", "did_not_complete", "declined", "invalid"],
  meetup_scheduled: ["did_not_complete", "declined", "invalid"],
  declined: ["reviewing"],
  did_not_complete: ["reviewing"],
  completed: [],
  invalid: [],
};

// Prompt 39 / spec §17A: prelaunch offers are COLLECTED ONLY. While the
// challenge has not been started, offers are frozen at their current status
// — no selecting, shortlisting, or even declining. The whole ladder unlocks
// when START CHALLENGE NOW flips the status to active. An unknown or absent
// challenge status fails closed (locked); the database trigger (migration
// 17) enforces the same freeze server-side.
export function offersLockedBeforeLaunch(challengeStatus: string | null | undefined): boolean {
  return challengeStatus !== "active" && challengeStatus !== "complete";
}

// `challengeStatus` defaults to locked: a caller that does not know the
// challenge phase offers no transitions at all.
export function canTransition(
  from: OfferStatus,
  to: OfferStatus,
  challengeStatus: string | null = null,
): boolean {
  if (from === to) return false;
  if (offersLockedBeforeLaunch(challengeStatus)) return false;
  return OFFER_TRANSITIONS[from].includes(to);
}

// Quick list actions: allowed only when the transition matrix agrees.
export function canSetStatus(
  from: OfferStatus,
  to: OfferStatus,
  challengeStatus: string | null = null,
): boolean {
  if (!canTransition(from, to, challengeStatus)) return false;
  return LIST_ACTIONS.some((action) => action.status === to);
}

export function availableActions(
  from: OfferStatus,
  challengeStatus: string | null = null,
): ReadonlyArray<{ status: OfferStatus; label: string }> {
  return LIST_ACTIONS.filter((action) => canSetStatus(from, action.status, challengeStatus));
}

// Detail-page transitions: the action set minus whatever the matrix forbids
// from the current state. Nothing here touches the public challenge.
export function canSetDetailStatus(
  from: OfferStatus,
  to: OfferStatus,
  challengeStatus: string | null = null,
): boolean {
  if (!canTransition(from, to, challengeStatus)) return false;
  return DETAIL_ACTIONS.some((action) => action.status === to);
}

export function availableDetailActions(
  from: OfferStatus,
  challengeStatus: string | null = null,
): ReadonlyArray<{ status: OfferStatus; label: string }> {
  return DETAIL_ACTIONS.filter((action) => canSetDetailStatus(from, action.status, challengeStatus));
}

// Prompt 39: an offer is PRELAUNCH when it was collected before START
// CHALLENGE NOW stamped start_at (migration 16 uses the database clock and
// start_at is never moved earlier afterward, so created_at < start_at is a
// reliable marker — no extra column needed). While the challenge has never
// started, every stored offer is prelaunch by construction.
export function isPrelaunchOffer(
  createdAtIso: string | null | undefined,
  startAtIso: string | null | undefined,
): boolean {
  if (!startAtIso) return true;
  const created = Date.parse(createdAtIso ?? "");
  if (Number.isNaN(created)) return false;
  const start = Date.parse(startAtIso);
  if (Number.isNaN(start)) return false;
  return created < start;
}
