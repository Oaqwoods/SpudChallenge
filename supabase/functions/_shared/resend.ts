// Resend sending + confirmation-email templates. All sending is guarded:
// when RESEND_API_KEY / RESEND_FROM are not configured (e.g. local dev or
// pre-Resend setup) functions fail gracefully and never lose the preference
// record (spec PROMPT 6).

interface SendArgs {
  to: string;
  subject: string;
  html: string;
}

export function resendConfigured(): boolean {
  return Boolean(Deno.env.get("RESEND_API_KEY") && Deno.env.get("RESEND_FROM"));
}

export async function sendEmail(args: SendArgs): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("RESEND_FROM");
  if (!apiKey || !from) return false;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
    }),
  });
  return res.ok;
}

export function siteUrl(): string {
  return Deno.env.get("PUBLIC_SITE_URL") ?? "https://spudchallenge.online";
}

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export function buildConfirmation(opts: {
  emailUpdates: boolean;
  tradeInterest: boolean;
  unsubscribeUrl: string | null;
}): { subject: string; html: string } {
  const url = siteUrl();
  const subject = opts.emailUpdates
    ? "You're following $1 → $5M"
    : "ONE → FIVE — we'll let you know when trades open";

  const parts: string[] = [
    `<p>We started with one dollar. We can only trade what we currently have. No adding cash to a trade. The clock never resets.</p>`,
  ];
  if (opts.emailUpdates) {
    parts.push(
      `<p>You're on the list: <strong>every completed trade</strong> will land in this inbox.</p>`,
    );
  }
  if (opts.tradeInterest) {
    parts.push(
      `<p>You told us you might have something to trade. We'll contact you when the challenge / current trade opens.</p>`,
    );
  }
  parts.push(
    `<p><a href="${escapeHtml(url)}">Follow the challenge →</a></p>`,
    `<p style="color:#666;font-size:12px;">ONE → FIVE · $1 → $5,000,000 in 21 Days · A Trade Challenge by Spud</p>`,
  );
  if (opts.unsubscribeUrl) {
    parts.push(
      `<p style="color:#666;font-size:12px;"><a href="${escapeHtml(opts.unsubscribeUrl)}">Unsubscribe from these emails</a></p>`,
    );
  }

  return {
    subject,
    html: `<div style="font-family:monospace,monospace;max-width:560px;margin:0 auto;padding:24px;background:#0a0a0f;color:#ece9e2;">${parts.join("")}</div>`,
  };
}
