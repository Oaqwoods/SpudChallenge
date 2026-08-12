import { getSupabase } from "./supabase";

export type ChallengePhase = "prelaunch" | "active" | "complete";

export interface ChallengeSettings {
  title: string;
  subtitle: string;
  starting_value: number;
  target_value: number;
  start_at: string | null;
  end_at: string | null;
  status: ChallengePhase;
  current_item_name: string;
  current_item_description: string | null;
  current_item_value: number;
  current_item_image_path: string | null;
  current_item_general_location: string | null;
  current_trade_number: number;
  offers_paused: boolean;
  follower_signups_paused: boolean;
  public_notice: string | null;
  updated_at: string | null;
}

export interface PublicTrade {
  id: string;
  trade_number: number;
  outgoing_item: string;
  incoming_item: string;
  outgoing_value: number;
  incoming_value: number;
  valuation_status: "estimated" | "verified";
  valuation_method: string;
  btc_amount: number | null;
  btc_usd_value: number | null;
  btc_valued_at: string | null;
  btc_valuation_source: string | null;
  public_story: string | null;
  public_participant_name: string | null;
  general_location: string | null;
  completed_at: string;
  published_at: string | null;
}

export interface TradeMedia {
  id: string;
  trade_id: string;
  storage_path: string;
  alt_text: string | null;
  sort_order: number;
}

export interface ChallengeData {
  configured: boolean;
  settings: ChallengeSettings | null;
  trades: PublicTrade[];
  mediaByTrade: Record<string, TradeMedia[]>;
  followerCount: number | null;
  error: string | null;
}

// Fallbacks match the seeded prelaunch state so the page still renders
// coherently when Supabase is not configured yet or a fetch fails.
export const DEFAULT_SETTINGS: ChallengeSettings = {
  title: "ONE → FIVE",
  subtitle: "$1 → $5,000,000 in 21 Days",
  starting_value: 1,
  target_value: 5000000,
  start_at: null,
  end_at: null,
  status: "prelaunch",
  current_item_name: "One U.S. Dollar",
  current_item_description: "A single U.S. dollar — where the challenge begins.",
  current_item_value: 1,
  current_item_image_path: null,
  current_item_general_location: null,
  current_trade_number: 0,
  offers_paused: false,
  follower_signups_paused: false,
  public_notice: null,
  updated_at: null,
};

export const EMPTY_DATA: ChallengeData = {
  configured: false,
  settings: null,
  trades: [],
  mediaByTrade: {},
  followerCount: null,
  error: null,
};

function num(value: unknown, fallback = 0): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function toSettings(row: Record<string, unknown>): ChallengeSettings {
  const status = str(row.status);
  return {
    title: str(row.title) ?? DEFAULT_SETTINGS.title,
    subtitle: str(row.subtitle) ?? DEFAULT_SETTINGS.subtitle,
    starting_value: num(row.starting_value, 1),
    target_value: num(row.target_value, 5000000),
    start_at: str(row.start_at),
    end_at: str(row.end_at),
    status: status === "active" || status === "complete" ? status : "prelaunch",
    current_item_name: str(row.current_item_name) ?? DEFAULT_SETTINGS.current_item_name,
    current_item_description: str(row.current_item_description),
    current_item_value: num(row.current_item_value, 1),
    current_item_image_path: str(row.current_item_image_path),
    current_item_general_location: str(row.current_item_general_location),
    current_trade_number: num(row.current_trade_number, 0),
    offers_paused: Boolean(row.offers_paused),
    follower_signups_paused: Boolean(row.follower_signups_paused),
    public_notice: str(row.public_notice),
    updated_at: str(row.updated_at),
  };
}

function toTrade(row: Record<string, unknown>): PublicTrade {
  return {
    id: str(row.id) ?? "",
    trade_number: num(row.trade_number),
    outgoing_item: str(row.outgoing_item) ?? "—",
    incoming_item: str(row.incoming_item) ?? "—",
    outgoing_value: num(row.outgoing_value),
    incoming_value: num(row.incoming_value),
    valuation_status: row.valuation_status === "verified" ? "verified" : "estimated",
    valuation_method: str(row.valuation_method) ?? "—",
    btc_amount: row.btc_amount == null ? null : num(row.btc_amount),
    btc_usd_value: row.btc_usd_value == null ? null : num(row.btc_usd_value),
    btc_valued_at: str(row.btc_valued_at),
    btc_valuation_source: str(row.btc_valuation_source),
    public_story: str(row.public_story),
    public_participant_name: str(row.public_participant_name),
    general_location: str(row.general_location),
    completed_at: str(row.completed_at) ?? "",
    published_at: str(row.published_at),
  };
}

export async function fetchChallengeData(): Promise<ChallengeData> {
  const supabase = getSupabase();
  if (!supabase) {
    return { ...EMPTY_DATA, error: "Supabase is not configured yet." };
  }

  try {
    const [settingsRes, tradesRes, countRes] = await Promise.all([
      supabase.from("public_challenge_settings").select("*").maybeSingle(),
      supabase.from("public_trades").select("*").order("trade_number", { ascending: true }),
      supabase.from("public_follower_count").select("follower_count").maybeSingle(),
    ]);
    if (settingsRes.error) throw settingsRes.error;
    if (tradesRes.error) throw tradesRes.error;
    if (countRes.error) throw countRes.error;

    const trades = ((tradesRes.data ?? []) as Record<string, unknown>[]).map(toTrade);

    const mediaByTrade: Record<string, TradeMedia[]> = {};
    if (trades.length > 0) {
      const mediaRes = await supabase
        .from("public_trade_media")
        .select("*")
        .order("sort_order", { ascending: true });
      if (!mediaRes.error) {
        for (const row of (mediaRes.data ?? []) as Record<string, unknown>[]) {
          const tradeId = str(row.trade_id);
          if (!tradeId) continue;
          const media: TradeMedia = {
            id: str(row.id) ?? "",
            trade_id: tradeId,
            storage_path: str(row.storage_path) ?? "",
            alt_text: str(row.alt_text),
            sort_order: num(row.sort_order),
          };
          (mediaByTrade[tradeId] ??= []).push(media);
        }
      }
    }

    return {
      configured: true,
      settings: settingsRes.data ? toSettings(settingsRes.data as Record<string, unknown>) : null,
      trades,
      mediaByTrade,
      followerCount: countRes.data ? num((countRes.data as { follower_count?: unknown }).follower_count) : null,
      error: null,
    };
  } catch (err) {
    return {
      ...EMPTY_DATA,
      configured: true,
      error: err instanceof Error ? err.message : "Failed to load challenge data.",
    };
  }
}

// Combines the authoritative stored status with the clock: an active challenge
// past end_at reads as complete; a start time in the past reads as active.
export function getPhase(settings: ChallengeSettings | null, nowMs: number): ChallengePhase {
  if (!settings) return "prelaunch";
  if (settings.status === "complete") return "complete";
  const end = settings.end_at ? Date.parse(settings.end_at) : null;
  if (end !== null && !Number.isNaN(end) && nowMs >= end) return "complete";
  const start = settings.start_at ? Date.parse(settings.start_at) : null;
  if (settings.status === "active") return "active";
  if (start !== null && !Number.isNaN(start) && nowMs >= start && (end === null || nowMs < end)) {
    return "active";
  }
  return "prelaunch";
}
