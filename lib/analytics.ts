// Lightweight, privacy-light analytics client (playbook prompt 14 / build
// spec §13). Fire-and-forget: never blocks the UI, never throws, and sends
// only the event name, pathname, UTMs and a coarse detail string — never
// emails, phone numbers, offer text or uploaded files.

import { edgeFunctionUrl, edgeHeaders } from "@/lib/supabase";
import { readUtm } from "@/lib/utm";

// Mirrors the analytics_events_name check constraint (migration 8) and the
// track-event Edge Function allowlist.
export type AnalyticsEvent =
  | "page_view"
  | "follow_cta_clicked"
  | "follower_submitted"
  | "follower_wall_opt_in"
  | "potential_trader_captured"
  | "offer_cta_clicked"
  | "offer_started"
  | "offer_submitted"
  | "share_clicked"
  | "rules_viewed"
  | "trade_detail_viewed";

export function track(event: AnalyticsEvent, detail?: string): void {
  if (typeof window === "undefined") return;
  const endpoint = edgeFunctionUrl("track-event");
  if (!endpoint) return;

  const payload = {
    event,
    path: window.location.pathname,
    detail: detail ?? null,
    ...readUtm(),
  };

  // keepalive lets the request outlive navigation (CTA clicks that leave
  // the page). Failures are swallowed by design.
  fetch(endpoint, {
    method: "POST",
    headers: edgeHeaders(),
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}
