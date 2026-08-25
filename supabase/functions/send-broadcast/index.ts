// send-broadcast — admin-reviewed trade-update emails (playbook PROMPT 12 /
// build spec §7). Admin-only: the caller's session JWT is verified AND the
// user must be in app_admins. A broadcast must be a 'draft' and the request
// must carry an explicit confirm flag — nothing is ever auto-sent and a sent
// broadcast can never be re-sent from here. Every recipient is logged to
// email_broadcast_recipients: addresses already logged 'sent' are skipped on
// retry, and unsubscribed followers are excluded from every audience.

import { chunk, MAX_BATCH_SIZE, resolveAudience, type AudienceRow, type AudienceType } from "../_shared/broadcast.ts";
import { corsHeaders, isOriginAllowed } from "../_shared/cors.ts";
import { errorMessage } from "../_shared/logging.ts";
import { checkRateLimit, clientIp } from "../_shared/rate-limit.ts";
import { resendConfigured, sendBatch, siteUrl } from "../_shared/resend.ts";
import { getAdminClient } from "../_shared/supabase-admin.ts";
import { preferenceToken } from "../_shared/token.ts";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_RECIPIENTS = 50_000;

function json(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", ...cors },
  });
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

// Returns the admin's user id, or null when the JWT is invalid/expired or
// the user is not registered in app_admins.
async function verifyAdmin(token: string | null): Promise<string | null> {
  if (!token) return null;
  const supabase = getAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  const probe = await supabase
    .from("app_admins")
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (probe.error || !probe.data) return null;
  return data.user.id;
}

interface BroadcastRow {
  id: string;
  subject: string;
  body_html: string;
  audience_type: AudienceType;
  status: string;
}

interface FollowerRow extends AudienceRow {
  id: string;
}

// Fetches the audience rows page by page (PostgREST caps each response).
async function fetchAudienceRows(
  audience: AudienceType,
): Promise<FollowerRow[] | { error: string }> {
  const supabase = getAdminClient();
  const rows: FollowerRow[] = [];
  const pageSize = 1000;
  for (let from = 0; from < MAX_RECIPIENTS; from += pageSize) {
    let query = supabase
      .from("followers")
      .select("id, email, email_updates_opt_in, email_updates_unsubscribed_at, trade_interest")
      .is("email_updates_unsubscribed_at", null)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);
    if (audience === "ongoing_followers") {
      query = query.eq("email_updates_opt_in", true);
    } else if (audience === "trade_interest") {
      query = query.eq("trade_interest", true);
    }
    const res = await query;
    if (res.error) return { error: res.error.message };
    const page = (res.data ?? []) as unknown as FollowerRow[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  return { error: "Audience is larger than the supported maximum." };
}

// Self-contained footer appended to the stored (admin-edited) body so it
// renders regardless of how the body markup is structured.
function unsubscribeFooter(unsubscribeUrl: string): string {
  const safe = unsubscribeUrl
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return (
    `\n<div style="font-family:monospace,monospace;max-width:560px;margin:0 auto;padding:0 24px 24px;background:#0a0a0f;">` +
    `<p style="color:#666666;font-size:12px;"><a href="${safe}" style="color:#666666;">Unsubscribe from these emails</a></p>` +
    `</div>`
  );
}

// PostgREST caps each response at 1000 rows, so anything set-shaped is
// fetched page by page.
async function fetchSentEmails(broadcastId: string): Promise<Set<string> | { error: string }> {
  const supabase = getAdminClient();
  const out = new Set<string>();
  const pageSize = 1000;
  for (let from = 0; from < MAX_RECIPIENTS; from += pageSize) {
    const res = await supabase
      .from("email_broadcast_recipients")
      .select("email")
      .eq("broadcast_id", broadcastId)
      .eq("status", "sent")
      .order("email", { ascending: true })
      .range(from, from + pageSize - 1);
    if (res.error) return { error: res.error.message };
    const page = (res.data ?? []) as { email: string }[];
    for (const row of page) out.add(row.email.toLowerCase());
    if (page.length < pageSize) return out;
  }
  return { error: "Recipient log is larger than the supported maximum." };
}

async function fetchTargetRows(
  broadcastId: string,
): Promise<{ id: string; email: string }[] | { error: string }> {
  const supabase = getAdminClient();
  const out: { id: string; email: string }[] = [];
  const pageSize = 1000;
  for (let from = 0; from < MAX_RECIPIENTS; from += pageSize) {
    const res = await supabase
      .from("email_broadcast_recipients")
      .select("id, email")
      .eq("broadcast_id", broadcastId)
      .neq("status", "sent")
      .order("email", { ascending: true })
      .range(from, from + pageSize - 1);
    if (res.error) return { error: res.error.message };
    const page = (res.data ?? []) as { id: string; email: string }[];
    out.push(...page);
    if (page.length < pageSize) return out;
  }
  return { error: "Recipient log is larger than the supported maximum." };
}

async function countRecipientsByStatus(
  broadcastId: string,
  status: string,
): Promise<number | { error: string }> {
  const supabase = getAdminClient();
  const res = await supabase
    .from("email_broadcast_recipients")
    .select("status", { count: "exact", head: true })
    .eq("broadcast_id", broadcastId)
    .eq("status", status);
  if (res.error) return { error: res.error.message };
  return res.count ?? 0;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed." }, 405, cors);
  }
  if (origin && !isOriginAllowed(origin)) {
    return json({ error: "Origin not allowed." }, 403, cors);
  }
  if (!checkRateLimit(`send-broadcast:${clientIp(req)}`, RATE_LIMIT, RATE_WINDOW_MS)) {
    return json({ error: "Too many requests. Please try again in a few minutes." }, 429, cors);
  }

  let adminId: string | null = null;
  try {
    adminId = await verifyAdmin(bearerToken(req));
  } catch (err) {
    console.error("send-broadcast admin verification failed:", errorMessage(err));
    return json({ error: "Admin verification is unavailable right now." }, 500, cors);
  }
  if (!adminId) {
    return json({ error: "Admin sign-in is required to send broadcasts." }, 401, cors);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return json({ error: "Invalid request." }, 400, cors);
    }
    const record = body as Record<string, unknown>;
    const broadcastId = typeof record.broadcast_id === "string" ? record.broadcast_id : "";
    if (!broadcastId) {
      return json({ error: "Missing broadcast id." }, 400, cors);
    }
    if (record.confirm !== true) {
      return json(
        { error: "Sending requires explicit confirmation from the admin review screen." },
        400,
        cors,
      );
    }

    // Pre-flight checks before touching any state.
    if (!resendConfigured()) {
      return json(
        { error: "Email sending is not configured yet (RESEND_API_KEY / RESEND_FROM)." },
        503,
        cors,
      );
    }
    const tokenSecret = Deno.env.get("PREFERENCE_TOKEN_SECRET");
    if (!tokenSecret) {
      return json({ error: "Unsubscribe tokens are not configured." }, 500, cors);
    }

    const supabase = getAdminClient();
    const broadcastRes = await supabase
      .from("email_broadcasts")
      .select("id, subject, body_html, audience_type, status")
      .eq("id", broadcastId)
      .maybeSingle();
    if (broadcastRes.error) throw broadcastRes.error;
    const broadcast = broadcastRes.data as BroadcastRow | null;
    if (!broadcast) {
      return json({ error: "Broadcast not found." }, 404, cors);
    }
    if (broadcast.status === "sent") {
      return json({ error: "This broadcast was already sent. It will not be sent again." }, 409, cors);
    }
    if (broadcast.status === "sending") {
      return json({ error: "This broadcast is already being sent. Refresh and check its status." }, 409, cors);
    }
    if (broadcast.status !== "draft") {
      return json(
        { error: "Only drafts can be sent. Reset this broadcast to a draft first." },
        409,
        cors,
      );
    }

    // Claim the draft atomically: only one sender can flip draft → sending.
    const claim = await supabase
      .from("email_broadcasts")
      .update({ status: "sending" })
      .eq("id", broadcastId)
      .eq("status", "draft")
      .select("id");
    if (claim.error) throw claim.error;
    if (!claim.data || claim.data.length === 0) {
      return json({ error: "This broadcast changed state and cannot be sent right now." }, 409, cors);
    }

    try {
      const audience = broadcast.audience_type;
      const rowsOrError = await fetchAudienceRows(audience);
      if (!Array.isArray(rowsOrError)) throw new Error(rowsOrError.error);
      const followerByEmail = new Map<string, string>();
      for (const row of rowsOrError) {
        // resolveAudience keeps the first occurrence per address; mirror that.
        const key = row.email.trim().toLowerCase();
        if (key && !followerByEmail.has(key)) followerByEmail.set(key, row.id);
      }
      const eligible = resolveAudience(rowsOrError, audience);

      // Never re-email an address already logged 'sent' for this broadcast.
      const alreadySent = await fetchSentEmails(broadcastId);
      if (!(alreadySent instanceof Set)) throw new Error(alreadySent.error);
      const targets = eligible.filter((email) => !alreadySent.has(email));

      if (targets.length > 0) {
        const recipientRows = targets.map((email) => ({
          broadcast_id: broadcastId,
          follower_id: followerByEmail.get(email) ?? null,
          email,
          status: "pending",
        }));
        for (const group of chunk(recipientRows, 500)) {
          const upsert = await supabase
            .from("email_broadcast_recipients")
            .upsert(group, { onConflict: "broadcast_id,email", ignoreDuplicates: true });
          if (upsert.error) throw upsert.error;
        }
      }

      // Recipient row ids drive the per-recipient log updates.
      const targetRows = await fetchTargetRows(broadcastId);
      if (!Array.isArray(targetRows)) throw new Error(targetRows.error);

      let sent = 0;
      let failed = 0;
      for (const group of chunk(targetRows, MAX_BATCH_SIZE)) {
        const personalized: { id: string; message: { to: string; subject: string; html: string } }[] = [];
        for (const row of group) {
          const token = await preferenceToken(tokenSecret, row.email);
          const unsubscribeUrl =
            `${siteUrl()}/unsubscribe/?e=${encodeURIComponent(row.email)}&t=${token}`;
          personalized.push({
            id: row.id,
            message: {
              to: row.email,
              subject: broadcast.subject,
              html: broadcast.body_html + unsubscribeFooter(unsubscribeUrl),
            },
          });
        }

        const result = await sendBatch(personalized.map((p) => p.message));
        if (result.ok && result.ids.length === personalized.length) {
          for (let i = 0; i < personalized.length; i++) {
            const update = await supabase
              .from("email_broadcast_recipients")
              .update({ status: "sent", resend_id: result.ids[i], error: null })
              .eq("id", personalized[i].id);
            if (update.error) throw update.error;
          }
          sent += personalized.length;
        } else {
          const message = result.ok
            ? "Resend returned an unexpected response for this batch."
            : result.error;
          for (const row of personalized) {
            const update = await supabase
              .from("email_broadcast_recipients")
              .update({ status: "failed", error: message })
              .eq("id", row.id);
            if (update.error) throw update.error;
          }
          failed += personalized.length;
        }
      }

      // Recount from the log so partial earlier attempts are included.
      const sentCount = await countRecipientsByStatus(broadcastId, "sent");
      if (typeof sentCount !== "number") throw new Error(sentCount.error);
      const errorCount = await countRecipientsByStatus(broadcastId, "failed");
      if (typeof errorCount !== "number") throw new Error(errorCount.error);

      const finalUpdate = await supabase
        .from("email_broadcasts")
        .update({
          status: errorCount === 0 ? "sent" : "failed",
          sent_count: sentCount,
          error_count: errorCount,
          sent_at: new Date().toISOString(),
        })
        .eq("id", broadcastId);
      if (finalUpdate.error) throw finalUpdate.error;

      return json(
        {
          ok: true,
          status: errorCount === 0 ? "sent" : "failed",
          sent_count: sentCount,
          error_count: errorCount,
          attempted_now: sent + failed,
        },
        200,
        cors,
      );
    } catch (err) {
      console.error("send-broadcast failed mid-send:", errorMessage(err));
      // Leave an accurate trail: the broadcast is no longer in flight.
      await supabase
        .from("email_broadcasts")
        .update({ status: "failed" })
        .eq("id", broadcastId);
      return json(
        { error: "Sending stopped unexpectedly. Check the recipient log and retry from a draft." },
        500,
        cors,
      );
    }
  } catch (err) {
    console.error("send-broadcast failed:", errorMessage(err));
    return json({ error: "Something went wrong. Please try again." }, 500, cors);
  }
});
