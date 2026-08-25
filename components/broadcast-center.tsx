"use client";

// Admin email broadcast center (playbook prompt 12 / build spec §7). Lists
// stored broadcasts, opens a draft for editing (subject + body), shows a
// live preview and the deliverable audience count, and sends only after an
// explicit confirmation step. Sending runs in the send-broadcast Edge
// Function; every recipient is logged, unsubscribed followers are excluded,
// and a broadcast that already went out can never be re-sent from here.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getSupabase, callAdminEdgeFunction } from "@/lib/supabase";
import { uuidFromQuery } from "@/lib/admin-offers";
import { AUDIENCE_LABELS } from "@/lib/broadcast";
import { formatDateTime } from "@/lib/time";
import { Panel } from "@/components/ui";

const inputClass =
  "w-full border-[3px] border-edge bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent";
const labelClass = "font-display text-[8px] uppercase text-faded sm:text-[9px]";
const primaryButtonClass =
  "border-[3px] border-accent bg-accent px-4 py-2 font-display text-[9px] uppercase tracking-wider text-black transition-colors hover:bg-transparent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 sm:text-[10px]";
const quietButtonClass =
  "border-[3px] border-edge px-4 py-2 font-display text-[9px] uppercase tracking-wider text-faded transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 sm:text-[10px]";
const dangerButtonClass =
  "border-[3px] border-alert px-4 py-2 font-display text-[9px] uppercase tracking-wider text-alert transition-colors hover:bg-alert hover:text-black disabled:cursor-not-allowed disabled:opacity-50 sm:text-[10px]";

type BroadcastStatus = "draft" | "sending" | "sent" | "failed";

interface BroadcastRow {
  id: string;
  trade_id: string | null;
  subject: string;
  body_html: string;
  audience_type: string;
  status: BroadcastStatus;
  sent_count: number;
  error_count: number;
  sent_at: string | null;
  created_at: string;
  trade_number: number | null;
}

interface FailedRecipient {
  email: string;
  error: string | null;
}

const STATUS_BADGE: Record<BroadcastStatus, string> = {
  draft: "border-faded text-faded",
  sending: "border-accent text-accent",
  sent: "border-mint text-mint",
  failed: "border-alert text-alert",
};

function StatusBadge({ status }: { status: BroadcastStatus }) {
  return (
    <span
      className={`inline-block border-2 px-2 py-0.5 font-display text-[7px] uppercase sm:text-[8px] ${STATUS_BADGE[status]}`}
    >
      {status}
    </span>
  );
}

function asBroadcastRow(raw: Record<string, unknown>): BroadcastRow {
  const trade = raw.trades as { trade_number?: number } | null;
  return {
    id: String(raw.id ?? ""),
    trade_id: typeof raw.trade_id === "string" ? raw.trade_id : null,
    subject: String(raw.subject ?? ""),
    body_html: String(raw.body_html ?? ""),
    audience_type: String(raw.audience_type ?? "ongoing_followers"),
    status: (["draft", "sending", "sent", "failed"].includes(String(raw.status))
      ? String(raw.status)
      : "draft") as BroadcastStatus,
    sent_count: Number(raw.sent_count ?? 0),
    error_count: Number(raw.error_count ?? 0),
    sent_at: typeof raw.sent_at === "string" ? raw.sent_at : null,
    created_at: String(raw.created_at ?? ""),
    trade_number: typeof trade?.trade_number === "number" ? trade.trade_number : null,
  };
}

// Deliverable count for an audience, mirroring the send-broadcast filters:
// unsubscribed followers are always excluded.
async function countAudience(audienceType: string): Promise<number | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  let query = supabase
    .from("followers")
    .select("email", { count: "exact", head: true })
    .is("email_updates_unsubscribed_at", null);
  if (audienceType === "ongoing_followers") {
    query = query.eq("email_updates_opt_in", true);
  } else if (audienceType === "trade_interest") {
    query = query.eq("trade_interest", true);
  } else {
    query = query.or("email_updates_opt_in.eq.true,trade_interest.eq.true");
  }
  const { count, error } = await query;
  return error ? null : count;
}

export function BroadcastCenter() {
  const [broadcastId, setBroadcastId] = useState<string | null | "resolving">("resolving");

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      await Promise.resolve();
      const id = uuidFromQuery(window.location.search, "id");
      if (!cancelled) setBroadcastId(id);
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  if (broadcastId === "resolving") {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Panel className="p-8 text-center" aria-hidden="true">
          <p className="font-display text-xs text-faded">LOADING…</p>
        </Panel>
      </main>
    );
  }

  return broadcastId ? (
    <BroadcastDetail broadcastId={broadcastId} />
  ) : (
    <BroadcastList />
  );
}

type ListState =
  | { phase: "loading" }
  | { phase: "unconfigured" }
  | { phase: "error"; message: string }
  | { phase: "ready"; broadcasts: BroadcastRow[] };

// Fetch-only (no setState): the caller awaits this and applies the result,
// so state updates always happen after the network round trip.
async function fetchBroadcastList(): Promise<ListState> {
  const supabase = getSupabase();
  if (!supabase) return { phase: "unconfigured" };
  const res = await supabase
    .from("email_broadcasts")
    .select("*, trades ( trade_number )")
    .order("created_at", { ascending: false })
    .limit(200);
  if (res.error) {
    return {
      phase: "error",
      message: `Could not load broadcasts (${res.error.message}). Check your session and try again.`,
    };
  }
  const rows = ((res.data ?? []) as unknown as Record<string, unknown>[]).map(asBroadcastRow);
  return { phase: "ready", broadcasts: rows };
}

function BroadcastList() {
  const [state, setState] = useState<ListState>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    const initialLoad = async () => {
      const next = await fetchBroadcastList();
      if (!cancelled) setState(next);
    };
    void initialLoad();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = async () => {
    setState({ phase: "loading" });
    const next = await fetchBroadcastList();
    setState(next);
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-base text-accent sm:text-lg">EMAIL BROADCASTS</h1>
        <div className="flex items-center gap-3">
          <Link href="/admin/" className="text-xs text-faded underline hover:text-accent">
            ← Dashboard
          </Link>
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-xs text-faded underline hover:text-accent"
          >
            Refresh
          </button>
        </div>
      </div>

      {state.phase === "loading" ? (
        <Panel className="mt-6 p-8 text-center" aria-hidden="true">
          <p className="font-display text-xs text-faded">LOADING…</p>
        </Panel>
      ) : state.phase === "unconfigured" || state.phase === "error" ? (
        <Panel className="mt-6 p-8 text-center" role="alert">
          <p className="mt-2 text-sm leading-relaxed text-faded">
            {state.phase === "unconfigured"
              ? "Admin is not configured yet (missing Supabase configuration)."
              : state.message}
          </p>
          <button type="button" onClick={() => void refresh()} className={`${primaryButtonClass} mt-6`}>
            Try again
          </button>
        </Panel>
      ) : state.broadcasts.length === 0 ? (
        <Panel className="mt-6 p-8 text-center">
          <p className="text-sm text-faded">
            No broadcasts yet. Publishing a trade prepares a draft automatically.
          </p>
        </Panel>
      ) : (
        <Panel className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b-[3px] border-edge font-display text-[8px] uppercase text-faded">
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Audience</th>
                <th className="px-3 py-2">Trade</th>
                <th className="px-3 py-2">Sent</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.broadcasts.map((broadcast) => (
                <tr key={broadcast.id} className="border-b border-edge align-top">
                  <td className="px-3 py-3">
                    <StatusBadge status={broadcast.status} />
                  </td>
                  <td className="px-3 py-3 text-foreground">{broadcast.subject}</td>
                  <td className="px-3 py-3 text-xs text-faded">
                    {AUDIENCE_LABELS[broadcast.audience_type] ?? broadcast.audience_type}
                  </td>
                  <td className="px-3 py-3 font-display text-xs text-foreground">
                    {broadcast.trade_number === null ? "—" : `#${broadcast.trade_number}`}
                  </td>
                  <td className="px-3 py-3 text-xs text-faded">
                    {broadcast.status === "sent" || broadcast.status === "failed"
                      ? `${broadcast.sent_count} sent · ${broadcast.error_count} failed`
                      : "—"}
                  </td>
                  <td className="px-3 py-3 text-xs text-faded">
                    {formatDateTime(broadcast.created_at)}
                  </td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/admin/emails/?id=${broadcast.id}`}
                      className="border-2 border-edge px-2 py-1 font-display text-[7px] uppercase tracking-wider text-faded transition-colors hover:border-accent hover:text-accent sm:text-[8px]"
                    >
                      {broadcast.status === "draft" ? "Review" : "Open"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}

      <p className="mt-3 text-xs leading-relaxed text-faded">
        Drafts are prepared automatically when a trade is published. Nothing is
        ever sent without an explicit confirmation here. Unsubscribed followers
        are excluded from every audience.
      </p>
    </main>
  );
}

type DetailState =
  | { phase: "loading" }
  | { phase: "unconfigured" }
  | { phase: "error"; message: string }
  | {
      phase: "ready";
      broadcast: BroadcastRow;
      audienceCount: number | null;
      failedRecipients: FailedRecipient[];
    };

// Fetch-only (no setState): the caller applies the result after the await.
async function fetchBroadcastDetail(broadcastId: string): Promise<DetailState> {
  const supabase = getSupabase();
  if (!supabase) return { phase: "unconfigured" };
  const res = await supabase
    .from("email_broadcasts")
    .select("*, trades ( trade_number )")
    .eq("id", broadcastId)
    .maybeSingle();
  if (res.error) {
    return {
      phase: "error",
      message: `Could not load this broadcast (${res.error.message}).`,
    };
  }
  if (!res.data) {
    return { phase: "error", message: "Broadcast not found." };
  }
  const broadcast = asBroadcastRow(res.data as Record<string, unknown>);
  const audienceCount = await countAudience(broadcast.audience_type);
  let failedRecipients: FailedRecipient[] = [];
  if (broadcast.status === "failed" || broadcast.status === "sent") {
    const failedRes = await supabase
      .from("email_broadcast_recipients")
      .select("email, error")
      .eq("broadcast_id", broadcastId)
      .eq("status", "failed")
      .order("email", { ascending: true })
      .limit(500);
    if (!failedRes.error) {
      failedRecipients = (
        (failedRes.data ?? []) as { email: string; error: string | null }[]
      ).map((row) => ({ email: row.email, error: row.error }));
    }
  }
  return { phase: "ready", broadcast, audienceCount, failedRecipients };
}

interface SendResult {
  status: "sent" | "failed";
  sent_count: number;
  error_count: number;
}

function BroadcastDetail({ broadcastId }: { broadcastId: string }) {
  const [state, setState] = useState<DetailState>({ phase: "loading" });
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [sendStep, setSendStep] = useState<"idle" | "confirm" | "sending">("idle");
  const [sendConfirmed, setSendConfirmed] = useState(false);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const initialLoad = async () => {
      const next = await fetchBroadcastDetail(broadcastId);
      if (cancelled) return;
      setState(next);
      if (next.phase === "ready") {
        setSubject(next.broadcast.subject);
        setBodyHtml(next.broadcast.body_html);
        setSendResult(null);
      }
    };
    void initialLoad();
    return () => {
      cancelled = true;
    };
  }, [broadcastId]);

  const reload = async () => {
    const next = await fetchBroadcastDetail(broadcastId);
    setState(next);
    if (next.phase === "ready") {
      setSubject(next.broadcast.subject);
      setBodyHtml(next.broadcast.body_html);
      setSendResult(null);
    }
  };

  const previewDoc = useMemo(
    () =>
      `<!doctype html><html><head><meta charset="utf-8"></head>` +
      `<body style="margin:0;padding:16px 0;background:#f2efe6;">${bodyHtml}</body></html>`,
    [bodyHtml],
  );

  if (state.phase === "loading") {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Panel className="p-8 text-center" aria-hidden="true">
          <p className="font-display text-xs text-faded">LOADING…</p>
        </Panel>
      </main>
    );
  }

  if (state.phase === "unconfigured" || state.phase === "error") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Panel className="p-8 text-center" role="alert">
          <p className="font-display text-xs text-accent">BROADCAST UNAVAILABLE</p>
          <p className="mt-4 text-sm leading-relaxed text-faded">
            {state.phase === "unconfigured"
              ? "Admin is not configured yet (missing Supabase configuration)."
              : state.message}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => void reload()}
              className={primaryButtonClass}
            >
              Try again
            </button>
            <Link href="/admin/emails/" className={quietButtonClass}>
              All broadcasts
            </Link>
          </div>
        </Panel>
      </main>
    );
  }

  const { broadcast, audienceCount, failedRecipients } = state;
  const editable = broadcast.status === "draft";

  const saveDraft = async () => {
    if (!editable || saving) return;
    setNotice(null);
    if (!subject.trim() || !bodyHtml.trim()) {
      setNotice({ tone: "error", text: "Subject and body are both required." });
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    setSaving(true);
    const { error } = await supabase
      .from("email_broadcasts")
      .update({ subject: subject.trim(), body_html: bodyHtml })
      .eq("id", broadcast.id);
    setSaving(false);
    if (error) {
      setNotice({ tone: "error", text: `Could not save the draft (${error.message}).` });
      return;
    }
    setNotice({ tone: "ok", text: "Draft saved." });
  };

  const resetToDraft = async () => {
    if (broadcast.status !== "failed" || saving) return;
    setNotice(null);
    const supabase = getSupabase();
    if (!supabase) return;
    setSaving(true);
    const { error } = await supabase
      .from("email_broadcasts")
      .update({ status: "draft" })
      .eq("id", broadcast.id)
      .eq("status", "failed");
    setSaving(false);
    if (error) {
      setNotice({ tone: "error", text: `Could not reset the broadcast (${error.message}).` });
      return;
    }
    await reload();
    setNotice({
      tone: "ok",
      text: "Broadcast reset to draft — already-delivered addresses stay skipped, only unsent addresses go out on retry.",
    });
  };

  const send = async () => {
    if (sendStep === "sending") return;
    setNotice(null);
    setSendStep("sending");
    try {
      const result = await callAdminEdgeFunction<SendResult>("send-broadcast", {
        broadcast_id: broadcast.id,
        confirm: true,
      });
      setSendResult({
        status: result.status,
        sent_count: result.sent_count,
        error_count: result.error_count,
      });
      await reload();
    } catch (err) {
      setNotice({
        tone: "error",
        text: err instanceof Error ? err.message : "Sending failed. Please try again.",
      });
    } finally {
      setSendStep("idle");
      setSendConfirmed(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-base text-accent sm:text-lg">
          {broadcast.trade_number === null
            ? "BROADCAST"
            : `TRADE #${broadcast.trade_number} BROADCAST`}
        </h1>
        <div className="flex items-center gap-3">
          <Link href="/admin/emails/" className="text-xs text-faded underline hover:text-accent">
            ← All broadcasts
          </Link>
          <button
            type="button"
            onClick={() => void reload()}
            className="text-xs text-faded underline hover:text-accent"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel className="p-4">
          <p className={labelClass}>Status</p>
          <p className="mt-2">
            <StatusBadge status={broadcast.status} />
          </p>
          {broadcast.sent_at ? (
            <p className="mt-2 text-xs text-faded">Sent {formatDateTime(broadcast.sent_at)}</p>
          ) : null}
          {broadcast.status === "sent" || broadcast.status === "failed" ? (
            <p className="mt-2 text-xs text-faded">
              {broadcast.sent_count} sent · {broadcast.error_count} failed
            </p>
          ) : null}
        </Panel>
        <Panel className="p-4">
          <p className={labelClass}>Audience</p>
          <p className="mt-2 text-sm text-foreground">
            {AUDIENCE_LABELS[broadcast.audience_type] ?? broadcast.audience_type}
          </p>
          <p className="mt-2 text-xs text-faded">
            {audienceCount === null
              ? "Count unavailable"
              : `${audienceCount} deliverable address${audienceCount === 1 ? "" : "es"} right now`}
          </p>
        </Panel>
        <Panel className="p-4">
          <p className={labelClass}>Created</p>
          <p className="mt-2 text-sm text-foreground">{formatDateTime(broadcast.created_at)}</p>
        </Panel>
      </div>

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mt-4 border-[3px] px-3 py-2 text-sm ${
            notice.tone === "error" ? "border-alert text-alert" : "border-mint text-mint"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      {sendResult ? (
        <Panel
          className={`mt-4 p-4 ${sendResult.status === "sent" ? "border-mint" : "border-alert"}`}
          role="status"
        >
          <p
            className={`font-display text-xs ${sendResult.status === "sent" ? "text-mint" : "text-alert"}`}
          >
            {sendResult.status === "sent" ? "BROADCAST SENT" : "SEND FINISHED WITH ERRORS"}
          </p>
          <p className="mt-2 text-sm text-foreground">
            {sendResult.sent_count} delivered · {sendResult.error_count} failed.
            {sendResult.error_count > 0
              ? " Failed addresses are listed below; already-delivered addresses are never re-emailed."
              : ""}
          </p>
        </Panel>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section aria-label="Edit broadcast" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="broadcast-subject" className={labelClass}>
              Subject {editable ? "(editable)" : "(locked — broadcast is not a draft)"}
            </label>
            <input
              id="broadcast-subject"
              className={inputClass}
              value={subject}
              maxLength={200}
              readOnly={!editable}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="broadcast-body" className={labelClass}>
              Body HTML
            </label>
            <textarea
              id="broadcast-body"
              className={`${inputClass} min-h-[320px] font-mono text-xs leading-relaxed`}
              value={bodyHtml}
              readOnly={!editable}
              onChange={(e) => setBodyHtml(e.target.value)}
            />
          </div>
          <p className="text-xs leading-relaxed text-faded">
            A personalized unsubscribe link is appended automatically when the
            email goes out — never paste one into the body.
          </p>
          {editable ? (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveDraft()}
                className={quietButtonClass}
              >
                {saving ? "Saving…" : "Save draft"}
              </button>
              {sendStep === "idle" ? (
                <button
                  type="button"
                  onClick={() => {
                    setNotice(null);
                    setSendStep("confirm");
                  }}
                  className={primaryButtonClass}
                >
                  Send to {audienceCount === null ? "audience" : `${audienceCount} recipients`}…
                </button>
              ) : null}
            </div>
          ) : null}

          {broadcast.status === "sending" ? (
            <Panel className="p-4">
              <p className="text-sm text-accent">
                Sending is in progress. Refresh in a moment to see the result.
              </p>
            </Panel>
          ) : null}

          {broadcast.status === "failed" && sendStep === "idle" ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={saving}
                onClick={() => void resetToDraft()}
                className={dangerButtonClass}
              >
                Reset to draft for retry
              </button>
              <p className="text-xs text-faded">
                Retrying only emails addresses that did not receive it.
              </p>
            </div>
          ) : null}

          {sendStep !== "idle" ? (
            <Panel className="border-accent p-4">
              <p className="font-display text-xs text-accent">CONFIRM SEND</p>
              <p className="mt-3 text-sm leading-relaxed text-foreground">
                This emails{" "}
                <strong>
                  {audienceCount === null ? "the audience" : `${audienceCount} people`}
                </strong>{" "}
                ({AUDIENCE_LABELS[broadcast.audience_type] ?? broadcast.audience_type}) with the
                subject “{subject.trim() || "(no subject)"}”. There is no undo.
              </p>
              <label className="mt-4 flex items-start gap-2 text-xs text-faded">
                <input
                  type="checkbox"
                  checked={sendConfirmed}
                  disabled={sendStep === "sending"}
                  onChange={(e) => setSendConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                I reviewed the preview and the audience. Send this broadcast now.
              </label>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!sendConfirmed || sendStep === "sending"}
                  onClick={() => void send()}
                  className={primaryButtonClass}
                >
                  {sendStep === "sending" ? "Sending…" : "Confirm and send"}
                </button>
                <button
                  type="button"
                  disabled={sendStep === "sending"}
                  onClick={() => {
                    setSendStep("idle");
                    setSendConfirmed(false);
                  }}
                  className={quietButtonClass}
                >
                  Cancel
                </button>
              </div>
            </Panel>
          ) : null}
        </section>

        <section aria-label="Preview" className="flex flex-col gap-2">
          <p className={labelClass}>Preview (unsubscribe footer added at send time)</p>
          <div className="border-[3px] border-edge bg-[#f2efe6]">
            <iframe
              title="Email preview"
              sandbox=""
              srcDoc={previewDoc}
              className="h-[560px] w-full"
            />
          </div>
        </section>
      </div>

      {failedRecipients.length > 0 ? (
        <section aria-label="Failed recipients" className="mt-8">
          <h2 className="font-display text-xs uppercase tracking-widest text-alert sm:text-sm">
            <span aria-hidden="true">▸ </span>Failed deliveries ({failedRecipients.length})
          </h2>
          <Panel className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b-[3px] border-edge font-display text-[8px] uppercase text-faded">
                  <th className="px-3 py-2">Address</th>
                  <th className="px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {failedRecipients.map((row) => (
                  <tr key={row.email} className="border-b border-edge">
                    <td className="px-3 py-2 text-foreground">{row.email}</td>
                    <td className="px-3 py-2 text-xs text-faded">
                      {row.error ?? "Unknown error"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </section>
      ) : null}
    </main>
  );
}
