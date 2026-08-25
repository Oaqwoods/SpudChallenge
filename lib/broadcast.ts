// Trade-update broadcast template + audience labels (playbook prompt 12 /
// build spec §7.2). Drafts are built client-side when a trade is published
// and stored on email_broadcasts; the admin reviews, edits and sends them
// from /admin/emails/. Sending itself happens only in the send-broadcast
// Edge Function, which appends the per-recipient unsubscribe footer.
//
// Leaf module with no local imports — unit tested directly under Node.

export const AUDIENCE_LABELS: Record<string, string> = {
  ongoing_followers: "Ongoing email followers",
  trade_interest: "Trade-interest leads",
  all: "Everyone still subscribed",
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatUsdForEmail(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMultiplierForEmail(currentValue: number, startingValue: number): string {
  if (!Number.isFinite(currentValue) || !Number.isFinite(startingValue) || startingValue <= 0) {
    return "×1";
  }
  const multiple = currentValue / startingValue;
  const digits = multiple < 10 ? 1 : 0;
  return `×${new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(multiple)}`;
}

function padTwo(n: number): string {
  return String(n).padStart(2, "0");
}

// Human label for the time left on the clock at draft time; null when no end
// time is configured.
export function timeRemainingLabel(endAtIso: string | null, nowMs: number): string | null {
  if (!endAtIso) return null;
  const end = Date.parse(endAtIso);
  if (Number.isNaN(end)) return null;
  if (end <= nowMs) return "The 21-day clock just hit zero";
  const totalSeconds = Math.floor((end - nowMs) / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return `${days}d ${padTwo(hours)}h ${padTwo(minutes)}m left on the 21-day clock`;
}

export interface TradeEmailInput {
  tradeNumber: number;
  outgoingItem: string;
  outgoingValue: number;
  incomingItem: string;
  incomingValue: number;
  // Challenge-level facts for the retention block.
  startingValue: number;
  currentValue: number;
  timeRemainingLabel: string | null;
  story: string | null;
  imageUrl: string | null;
  siteUrl: string;
}

const buttonStyle =
  "display:inline-block;border:3px solid #ece9e2;padding:10px 18px;" +
  "font-family:monospace,monospace;font-size:13px;letter-spacing:2px;" +
  "text-decoration:none;text-transform:uppercase;";

export function buildTradeEmail(input: TradeEmailInput): {
  subject: string;
  body_html: string;
} {
  const subject = `TRADE #${input.tradeNumber}: ${formatUsdForEmail(input.outgoingValue)} → ${formatUsdForEmail(input.incomingValue)}`;
  const multiplier = formatMultiplierForEmail(input.currentValue, input.startingValue);
  const story = input.story?.trim()
    ? `<p style="color:#c9c5ba;">${escapeHtml(input.story.trim())}</p>`
    : "";
  const image = input.imageUrl
    ? `<p><img src="${escapeHtml(input.imageUrl)}" alt="Current item after trade #${input.tradeNumber}" width="560" style="display:block;max-width:100%;border:3px solid #ece9e2;" /></p>`
    : "";
  const timeLine = input.timeRemainingLabel
    ? `<p style="color:#c9c5ba;">${escapeHtml(input.timeRemainingLabel)}</p>`
    : "";

  const body_html = [
    `<p style="color:#ece9e2;font-size:13px;letter-spacing:2px;">$1 → $5M · TRADE #${input.tradeNumber} COMPLETE</p>`,
    `<p style="color:#ece9e2;">We traded <strong>${escapeHtml(input.outgoingItem)}</strong> (${formatUsdForEmail(input.outgoingValue)}) for <strong>${escapeHtml(input.incomingItem)}</strong> (${formatUsdForEmail(input.incomingValue)}).</p>`,
    image,
    story,
    `<p style="color:#ece9e2;">Current value: <strong>${formatUsdForEmail(input.currentValue)}</strong> · ${multiplier} the $1 start.</p>`,
    timeLine,
    `<p><a href="${escapeHtml(input.siteUrl)}/offer/" style="${buttonStyle}color:#ece9e2;">Have something better?</a></p>`,
    `<p style="color:#c9c5ba;font-size:13px;">Forward this to someone who does.</p>`,
    `<p style="color:#c9c5ba;font-size:13px;"><a href="${escapeHtml(input.siteUrl)}" style="color:#c9c5ba;">Follow the challenge →</a></p>`,
  ]
    .filter((line) => line !== "")
    .join("\n");

  const wrapped =
    `<div style="font-family:monospace,monospace;max-width:560px;margin:0 auto;padding:24px;background:#0a0a0f;color:#ece9e2;">` +
    body_html +
    `</div>`;

  return { subject, body_html: wrapped };
}
