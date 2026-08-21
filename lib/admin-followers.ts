// Pure admin follower-list logic: group classification, filtering,
// counting, and wall-visibility mirroring (playbook PROMPT 23). No
// Supabase imports and no local imports — unit tested directly under Node
// (leaf module, like the other node-tested helpers).

function toStr(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export const FOLLOWER_GROUPS = ["all", "ongoing", "trade_interest", "both"] as const;

export type FollowerGroup = (typeof FOLLOWER_GROUPS)[number];

export const FOLLOWER_GROUP_LABELS: Record<FollowerGroup, string> = {
  all: "All signups",
  ongoing: "Ongoing email followers",
  trade_interest: "Trade-interest leads",
  both: "In both groups",
};

export interface AdminFollowerRow {
  id: string;
  email: string;
  first_name: string | null;
  email_updates_opt_in: boolean;
  email_updates_unsubscribed_at: string | null;
  trade_interest: boolean;
  public_wall_opt_in: boolean;
  public_display_name: string | null;
  public_general_location: string | null;
  public_visible: boolean;
  created_at: string;
}

export function toAdminFollower(row: Record<string, unknown>): AdminFollowerRow | null {
  const id = toStr(row.id);
  const email = toStr(row.email);
  if (!id || !email) return null;
  return {
    id,
    email,
    first_name: toStr(row.first_name),
    email_updates_opt_in: Boolean(row.email_updates_opt_in),
    email_updates_unsubscribed_at: toStr(row.email_updates_unsubscribed_at),
    trade_interest: Boolean(row.trade_interest),
    public_wall_opt_in: Boolean(row.public_wall_opt_in),
    public_display_name: toStr(row.public_display_name),
    public_general_location: toStr(row.public_general_location),
    public_visible: row.public_visible !== false,
    created_at: toStr(row.created_at) ?? "",
  };
}

// Active ongoing-email follower: opted in and never unsubscribed (the same
// rule public_follower_count uses).
export function isOngoing(f: AdminFollowerRow): boolean {
  return f.email_updates_opt_in && f.email_updates_unsubscribed_at === null;
}

export function isTradeInterest(f: AdminFollowerRow): boolean {
  return f.trade_interest;
}

export function matchesGroup(f: AdminFollowerRow, group: FollowerGroup): boolean {
  switch (group) {
    case "ongoing":
      return isOngoing(f);
    case "trade_interest":
      return isTradeInterest(f);
    case "both":
      return isOngoing(f) && isTradeInterest(f);
    case "all":
      return true;
  }
}

export function filterFollowers(rows: AdminFollowerRow[], group: FollowerGroup): AdminFollowerRow[] {
  return rows.filter((f) => matchesGroup(f, group));
}

export function countGroups(rows: AdminFollowerRow[]): {
  all: number;
  ongoing: number;
  trade_interest: number;
  both: number;
} {
  let ongoing = 0;
  let trade_interest = 0;
  let both = 0;
  for (const f of rows) {
    const o = isOngoing(f);
    const t = isTradeInterest(f);
    if (o) ongoing += 1;
    if (t) trade_interest += 1;
    if (o && t) both += 1;
  }
  return { all: rows.length, ongoing, trade_interest, both };
}

// Mirrors public_follower_wall exactly: active ongoing follower who opted
// into the wall, is still admin-visible, and supplied a display name.
export function isOnWall(f: AdminFollowerRow): boolean {
  return (
    isOngoing(f) &&
    f.public_wall_opt_in &&
    f.public_visible &&
    f.public_display_name !== null
  );
}

// Human-readable wall status for the admin list.
export function wallStatus(f: AdminFollowerRow): string {
  if (!isOngoing(f)) return f.email_updates_unsubscribed_at ? "Unsubscribed" : "No email opt-in";
  if (!f.public_wall_opt_in || f.public_display_name === null) return "Not on wall";
  return f.public_visible ? "On wall" : "Hidden";
}
