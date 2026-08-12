import { getSupabase } from "./supabase";
import {
  EMPTY_DATA,
  num,
  str,
  toSettings,
  toTrade,
  type ChallengeData,
  type TradeMedia,
} from "./challenge";

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
