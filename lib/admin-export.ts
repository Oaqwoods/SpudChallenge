// Admin-only CSV exports (playbook prompt 27). Pure serialization helpers —
// unit tested under Node. The download wiring lives in the admin components.
//
// Static export has no server runtime, so the flow is: the signed-in admin
// client fetches the rows (RLS is_admin() authorizes), and the file is
// generated and downloaded entirely in the browser. Exports include private
// columns (contact data, admin notes, BTC verification fields) by design —
// they are recordkeeping for the operator and never leave the admin session.

// PostgREST caps a single response at 1000 rows.
export const EXPORT_PAGE_SIZE = 1000;

export type ExportKind = "offers" | "followers" | "trades";

// RFC 4180: fields containing a comma, quote or line break are quoted, and
// embedded quotes are doubled. null/undefined render as empty.
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

// UTF-8 BOM so spreadsheet apps open accented/special characters correctly.
const BOM = "\uFEFF";

// RFC 4180 document: header row, CRLF line endings, columns in the given
// order. Unknown columns in a row render as empty fields.
export function toCsv(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
): string {
  const lines = [columns.map(csvField).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvField(row[column])).join(","));
  }
  return BOM + lines.join("\r\n") + "\r\n";
}

export function exportFilename(kind: ExportKind, now: Date = new Date()): string {
  return `${kind}-${now.toISOString().slice(0, 10)}.csv`;
}

// Column sets are curated (not `*`) so the export order stays readable and
// a renamed/added column surfaces as an obvious empty field rather than a
// silent layout shift. Keep in sync with supabase/migrations.

export const OFFER_EXPORT_COLUMNS = [
  "id",
  "created_at",
  "status",
  "name",
  "email",
  "phone",
  "city",
  "state",
  "zip",
  "in_person",
  "travel_distance",
  "item_name",
  "item_description",
  "claimed_value",
  "verified_value",
  "condition",
  "serial_or_model",
  "comp_url",
  "why_good_trade",
  "offered_against_trade_number",
  "offered_against_item_name",
  "offered_against_item_value",
  "meetup_scheduled_at",
  "meetup_general_location",
  "did_not_complete_reason",
  "last_contacted_at",
  "internal_notes",
  "verification_method",
  "authenticity_notes",
  "risk_flags",
  "contact_notes",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "landing_variant",
  "updated_at",
] as const;

export const FOLLOWER_EXPORT_COLUMNS = [
  "id",
  "created_at",
  "email",
  "first_name",
  "source",
  "email_updates_opt_in",
  "email_updates_opted_in_at",
  "email_updates_unsubscribed_at",
  "trade_interest",
  "trade_interest_at",
  "public_wall_opt_in",
  "public_display_name",
  "public_general_location",
  "public_visible",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "landing_variant",
] as const;

export const TRADE_EXPORT_COLUMNS = [
  "id",
  "trade_number",
  "created_at",
  "published",
  "published_at",
  "completed_at",
  "outgoing_item",
  "outgoing_value",
  "incoming_item",
  "incoming_value",
  "valuation_status",
  "valuation_method",
  "valuation_evidence",
  "btc_amount",
  "btc_usd_value",
  "btc_valued_at",
  "btc_valuation_source",
  "btc_wallet_address",
  "btc_transaction_id",
  "public_story",
  "public_participant_name",
  "publicity_release_confirmed",
  "general_location",
  "private_completion_notes",
  "source_offer_id",
  "updated_at",
] as const;

// Minimal structural type of the supabase-js query chain so this stays
// unit-testable without the real client:
// client.from(t).select("*").order(col).range(from, to) → { data, error }.
export interface PaginatedClient {
  from(table: string): {
    select(columns: string): {
      order(column: string, options?: { ascending?: boolean }): {
        range(from: number, to: number): PromiseLike<{
          data: unknown;
          error: { message: string } | null;
        }>;
      };
    };
  };
}

// Fetch every row of a table, page by page (PostgREST caps each response).
// Mirrors the paging pattern in send-broadcast. Deterministic ordering makes
// the export stable and the paging safe. Also used by the paginated admin
// lists so a list can never be silently truncated by a `.limit()` cap.
export async function fetchAllRows(
  client: PaginatedClient,
  table: string,
  orderColumn: string,
  columns: string = "*",
): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  const rows: Record<string, unknown>[] = [];
  // 100 pages of 1000 rows — far beyond any realistic V1 audience.
  for (let from = 0; from < 100_000; from += EXPORT_PAGE_SIZE) {
    const res = await client
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: true })
      .range(from, from + EXPORT_PAGE_SIZE - 1);
    if (res.error) return { rows: [], error: res.error.message };
    const page = (res.data ?? []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < EXPORT_PAGE_SIZE) return { rows, error: null };
  }
  return { rows, error: null };
}
