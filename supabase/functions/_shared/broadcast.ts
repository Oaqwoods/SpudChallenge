// Pure broadcast helpers shared by the send-broadcast Edge Function and the
// Node unit tests (playbook prompt 12 / build spec §7.3). Runtime-agnostic:
// no Deno APIs here.
//
// Audience rules (spec §4.9): only email_updates_opt_in followers receive
// ongoing completed-trade broadcasts; nobody who has unsubscribed ever
// receives anything, regardless of audience type.

export type AudienceType = "ongoing_followers" | "trade_interest" | "all";

export const AUDIENCE_TYPES: readonly AudienceType[] = [
  "ongoing_followers",
  "trade_interest",
  "all",
];

export interface AudienceRow {
  email: string;
  email_updates_opt_in: boolean;
  email_updates_unsubscribed_at: string | null;
  trade_interest: boolean;
}

// Returns the deliverable addresses for an audience: normalized, de-duplicated
// (case-insensitively), unsubscribed addresses excluded.
export function resolveAudience(
  rows: AudienceRow[],
  audience: AudienceType,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    if (row.email_updates_unsubscribed_at) continue;
    const eligible =
      audience === "ongoing_followers"
        ? row.email_updates_opt_in
        : audience === "trade_interest"
          ? row.trade_interest
          : row.email_updates_opt_in || row.trade_interest;
    if (!eligible) continue;
    const key = row.email.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

// Resend's batch endpoint accepts at most 100 messages per request.
export const MAX_BATCH_SIZE = 100;

export function chunk<T>(items: T[], size: number): T[][] {
  if (size < 1) throw new Error("Chunk size must be at least 1.");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
