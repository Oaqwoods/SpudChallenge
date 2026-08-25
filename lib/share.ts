// Share text + share-URL builders (playbook prompt 13 / build spec §4.11,
// §14). Sharing works without operating any social accounts: copy link,
// email, the native share sheet, and plain intent URLs for X/Facebook/
// Reddit. No third-party SDKs.
//
// Leaf module with no local imports — unit tested directly under Node.

export type SharePhase = "prelaunch" | "active" | "complete";

export interface ShareState {
  phase: SharePhase;
  currentItemName: string;
  currentValue: number;
  startingValue: number;
  targetValue: number;
  tradeNumber: number;
  // Pre-computed by the caller (e.g. "12d 04h 33m"); null renders as TBA.
  timeRemainingLabel: string | null;
}

export function formatUsdForShare(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

// Headline used for email subjects, reddit titles and the native share
// sheet. Emphasizes the $1 → $5M framing and the current trade number.
export function buildShareTitle(state: ShareState): string {
  if (state.phase === "prelaunch") {
    return `$1 → $5M in 21 days. Only trades.`;
  }
  return `Trade #${state.tradeNumber}: now holding ${state.currentItemName} (${formatUsdForShare(state.currentValue)})`;
}

// Message body for copy-link, email and the native share sheet. Carries
// the challenge framing, current item/value, trade number and time left.
export function buildShareText(state: ShareState): string {
  if (state.phase === "prelaunch") {
    return `$1 → $5M in 21 days. Only trades, no added cash, and the clock never resets. Follow every trade from day one.`;
  }
  const timeLeft = state.timeRemainingLabel ?? "Time remaining: TBA";
  if (state.phase === "complete") {
    return `$1 → $5M — the 21-day challenge is complete. Final item: ${state.currentItemName} at ${formatUsdForShare(state.currentValue)} after ${state.tradeNumber} trades.`;
  }
  return `$1 → $5M — Trade #${state.tradeNumber} done: now holding ${state.currentItemName} worth ${formatUsdForShare(state.currentValue)}. ${timeLeft} left.`;
}

export function xShareUrl(siteUrl: string, text: string): string {
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(siteUrl)}`;
}

export function facebookShareUrl(siteUrl: string): string {
  return `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(siteUrl)}`;
}

export function redditShareUrl(siteUrl: string, title: string): string {
  return `https://www.reddit.com/submit?url=${encodeURIComponent(siteUrl)}&title=${encodeURIComponent(title)}`;
}

export function emailShareUrl(siteUrl: string, subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${body}\n\n${siteUrl}`)}`;
}
