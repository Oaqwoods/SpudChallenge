"use client";

// Admin offer detail (playbook prompt 10). Shows every submitted field plus
// the private photos (short-lived signed URLs against the private bucket),
// and lets the admin record verification notes and move the offer through
// the workflow. Nothing here is ever auto-accepted and nothing here changes
// the public challenge — selecting or scheduling is a private decision.

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/time";
import { formatUsd } from "@/lib/format";
import { getSupabase } from "@/lib/supabase";
import {
  OFFER_STATUS_LABELS,
  availableDetailActions,
  canSetDetailStatus,
  offerIdFromQuery,
  toAdminOffer,
  type AdminOfferRow,
  type OfferStatus,
} from "@/lib/admin-offers";
import { Panel } from "@/components/ui";

// Signed URLs for private offer photos expire; 15 minutes is plenty for review.
const SIGNED_URL_TTL_SECONDS = 900;

const inputClass =
  "w-full border-[3px] border-edge bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent";
const labelClass = "font-display text-[8px] uppercase text-faded sm:text-[9px]";

const STATUS_BADGE: Record<OfferStatus, string> = {
  new: "border-accent text-accent",
  reviewing: "border-faded text-faded",
  shortlisted: "border-mint text-mint",
  selected: "border-accent text-accent",
  meetup_scheduled: "border-accent text-accent",
  declined: "border-alert text-alert",
  did_not_complete: "border-faded text-faded",
  completed: "border-mint text-mint",
  invalid: "border-alert text-alert",
};

// Live (non-terminal) states where recording a contact makes sense.
const LIVE_STATUSES: ReadonlyArray<OfferStatus> = [
  "new",
  "reviewing",
  "shortlisted",
  "selected",
  "meetup_scheduled",
];

interface OfferFile {
  id: string;
  storage_path: string;
  signedUrl: string | null;
}

type DetailState =
  | { phase: "loading" }
  | { phase: "unconfigured" }
  | { phase: "error"; message: string }
  | { phase: "not_found" }
  | { phase: "ready"; offer: AdminOfferRow; files: OfferFile[] };

// Fetch-only (no setState): the caller applies the result after the await.
async function fetchOfferDetail(id: string): Promise<DetailState> {
  const supabase = getSupabase();
  if (!supabase) return { phase: "unconfigured" };

  const offerRes = await supabase.from("offers").select("*").eq("id", id).maybeSingle();
  if (offerRes.error) {
    return {
      phase: "error",
      message: `Could not load this offer (${offerRes.error.message}).`,
    };
  }
  const offer = offerRes.data ? toAdminOffer(offerRes.data as Record<string, unknown>) : null;
  if (!offer) return { phase: "not_found" };

  const filesRes = await supabase
    .from("offer_files")
    .select("id, storage_path")
    .eq("offer_id", id)
    .order("created_at", { ascending: true });
  if (filesRes.error) {
    return {
      phase: "error",
      message: `Could not load this offer's photos (${filesRes.error.message}).`,
    };
  }

  const rows = (filesRes.data ?? []) as unknown as Array<{
    id: string;
    storage_path: string;
  }>;
  if (rows.length === 0) return { phase: "ready", offer, files: [] };

  const signed = await supabase.storage
    .from("offer-uploads")
    .createSignedUrls(rows.map((r) => r.storage_path), SIGNED_URL_TTL_SECONDS);
  const byPath = new Map<string, string>();
  for (const entry of signed.data ?? []) {
    if (entry.path && entry.signedUrl) byPath.set(entry.path, entry.signedUrl);
  }
  const files: OfferFile[] = rows.map((r) => ({
    id: r.id,
    storage_path: r.storage_path,
    signedUrl: byPath.get(r.storage_path) ?? null,
  }));
  return { phase: "ready", offer, files };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={labelClass}>{label}</span>
      {children}
    </div>
  );
}

function Value({ children }: { children: React.ReactNode }) {
  return <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">{children}</div>;
}

export function AdminOfferDetail() {
  const [state, setState] = useState<DetailState>({ phase: "loading" });
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  // Two-step actions (prompt 25): "Schedule Meetup" and "Did Not Complete"
  // arm an inline input instead of firing immediately, so the meetup area and
  // the walk-away reason are always captured with the status change.
  const [armed, setArmed] = useState<OfferStatus | null>(null);
  const [armedText, setArmedText] = useState("");

  // Editable private-admin fields (everything except status, which is action-driven).
  const [verifiedValue, setVerifiedValue] = useState("");
  const [verificationMethod, setVerificationMethod] = useState("");
  const [authenticityNotes, setAuthenticityNotes] = useState("");
  const [riskFlags, setRiskFlags] = useState("");
  const [contactNotes, setContactNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  useEffect(() => {
    let cancelled = false;
    const initialLoad = async () => {
      const id = offerIdFromQuery(window.location.search);
      if (!id) {
        if (!cancelled) setState({ phase: "not_found" });
        return;
      }
      const next = await fetchOfferDetail(id);
      if (!cancelled) {
        setState(next);
        if (next.phase === "ready") {
          setVerifiedValue(next.offer.verified_value === null ? "" : String(next.offer.verified_value));
          setVerificationMethod(next.offer.verification_method ?? "");
          setAuthenticityNotes(next.offer.authenticity_notes ?? "");
          setRiskFlags(next.offer.risk_flags ?? "");
          setContactNotes(next.offer.contact_notes ?? "");
          setInternalNotes(next.offer.internal_notes ?? "");
        }
      }
    };
    void initialLoad();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveNotes = async () => {
    if (state.phase !== "ready") return;
    const supabase = getSupabase();
    if (!supabase) return;

    const parsedValue = verifiedValue.trim() === "" ? null : Number(verifiedValue);
    if (parsedValue !== null && (!Number.isFinite(parsedValue) || parsedValue < 0)) {
      setNotice({ tone: "error", text: "Verified value must be a non-negative number." });
      return;
    }

    setPending(true);
    setNotice(null);
    const { error } = await supabase
      .from("offers")
      .update({
        verified_value: parsedValue,
        verification_method: verificationMethod.trim() || null,
        authenticity_notes: authenticityNotes.trim() || null,
        risk_flags: riskFlags.trim() || null,
        contact_notes: contactNotes.trim() || null,
        internal_notes: internalNotes.trim() || null,
      })
      .eq("id", state.offer.id);
    setPending(false);

    if (error) {
      setNotice({ tone: "error", text: `Could not save — ${error.message}` });
      return;
    }
    setState({
      ...state,
      offer: {
        ...state.offer,
        verified_value: parsedValue,
        verification_method: verificationMethod.trim() || null,
        authenticity_notes: authenticityNotes.trim() || null,
        risk_flags: riskFlags.trim() || null,
        contact_notes: contactNotes.trim() || null,
        internal_notes: internalNotes.trim() || null,
      },
    });
    setNotice({ tone: "ok", text: "Private fields saved." });
  };

  const applyStatus = async (next: OfferStatus) => {
    if (state.phase !== "ready" || !canSetDetailStatus(state.offer.status, next)) return;
    const supabase = getSupabase();
    if (!supabase) return;
    setPending(true);
    setNotice(null);
    const { error } = await supabase.from("offers").update({ status: next }).eq("id", state.offer.id);
    setPending(false);
    if (error) {
      setNotice({ tone: "error", text: `Could not update status — ${error.message}` });
      return;
    }
    setState({ ...state, offer: { ...state.offer, status: next } });
    setNotice({ tone: "ok", text: `Status set to ${OFFER_STATUS_LABELS[next]}.` });
  };

  const onAction = (next: OfferStatus) => {
    if (next === "meetup_scheduled" || next === "did_not_complete") {
      setArmed(next);
      setArmedText("");
      setNotice(null);
      return;
    }
    void applyStatus(next);
  };

  const confirmArmed = async () => {
    if (state.phase !== "ready" || armed === null) return;
    if (!canSetDetailStatus(state.offer.status, armed)) {
      setArmed(null);
      return;
    }
    const text = armedText.trim();
    if (armed === "meetup_scheduled" && text === "") {
      setNotice({ tone: "error", text: "Enter the general meetup area before scheduling." });
      return;
    }
    if (armed === "did_not_complete" && text === "") {
      setNotice({ tone: "error", text: "Record why the trade did not complete before closing it." });
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;

    const fields =
      armed === "meetup_scheduled"
        ? {
            status: armed,
            meetup_general_location: text,
            meetup_scheduled_at: new Date().toISOString(),
          }
        : {
            status: armed,
            did_not_complete_reason: text,
          };

    setPending(true);
    setNotice(null);
    const { error } = await supabase.from("offers").update(fields).eq("id", state.offer.id);
    setPending(false);
    if (error) {
      setNotice({ tone: "error", text: `Could not update status — ${error.message}` });
      return;
    }
    setState({ ...state, offer: { ...state.offer, ...fields } });
    setArmed(null);
    setArmedText("");
    setNotice({
      tone: "ok",
      text:
        armed === "meetup_scheduled"
          ? "Meetup scheduled. The exact location stays private."
          : "Marked did not complete. Nothing changed publicly.",
    });
  };

  const markContacted = async () => {
    if (state.phase !== "ready") return;
    const supabase = getSupabase();
    if (!supabase) return;
    const at = new Date().toISOString();
    setPending(true);
    setNotice(null);
    const { error } = await supabase
      .from("offers")
      .update({ last_contacted_at: at })
      .eq("id", state.offer.id);
    setPending(false);
    if (error) {
      setNotice({ tone: "error", text: `Could not record contact — ${error.message}` });
      return;
    }
    setState({ ...state, offer: { ...state.offer, last_contacted_at: at } });
    setNotice({ tone: "ok", text: "Contact recorded." });
  };

  if (state.phase === "loading") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Panel className="p-8 text-center" aria-hidden="true">
          <p className="font-display text-xs text-faded">LOADING…</p>
        </Panel>
      </main>
    );
  }

  if (state.phase === "not_found") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Panel className="p-8 text-center">
          <p className="font-display text-xs text-accent">OFFER NOT FOUND</p>
          <p className="mt-4 text-sm text-faded">
            This offer does not exist or the link is malformed.
          </p>
          <Link href="/admin/" className="mt-6 inline-block text-sm text-accent underline">
            ← Back to the dashboard
          </Link>
        </Panel>
      </main>
    );
  }

  if (state.phase === "unconfigured" || state.phase === "error") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Panel className="p-8 text-center" role="alert">
          <p className="font-display text-xs text-accent">UNAVAILABLE</p>
          <p className="mt-4 text-sm text-faded">
            {state.phase === "unconfigured"
              ? "Admin is not configured yet (missing Supabase configuration)."
              : state.message}
          </p>
          <Link href="/admin/" className="mt-6 inline-block text-sm text-accent underline">
            ← Back to the dashboard
          </Link>
        </Panel>
      </main>
    );
  }

  const { offer, files } = state;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/admin/" className="text-sm text-faded hover:text-accent">
        ← Back to the dashboard
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-base text-accent sm:text-lg">{offer.item_name}</h1>
        <span
          className={`inline-block border-2 px-2 py-0.5 font-display text-[8px] uppercase ${STATUS_BADGE[offer.status]}`}
        >
          {OFFER_STATUS_LABELS[offer.status]}
        </span>
      </div>
      <p className="mt-1 text-xs text-faded">
        Offered against Trade #{offer.offered_against_trade_number} —{" "}
        {offer.offered_against_item_name} ({formatUsd(offer.offered_against_item_value)}) ·
        Submitted {formatDateTime(offer.created_at)}
      </p>

      <p
        role="note"
        className="mt-4 border-[3px] border-accent bg-panel px-3 py-2 text-xs leading-relaxed text-accent"
      >
        No offer is automatically accepted by the software. Selecting or
        scheduling never changes the public challenge.
      </p>

      {notice ? (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mt-3 border-[3px] px-3 py-2 text-sm ${
            notice.tone === "error" ? "border-alert text-alert" : "border-mint text-mint"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <section aria-label="Workflow actions" className="mt-6">
        <Panel className="p-4">
          <p className={labelClass}>Workflow actions</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {availableDetailActions(offer.status).map((action) => (
              <button
                key={action.status}
                type="button"
                disabled={pending || armed !== null}
                onClick={() => onAction(action.status)}
                className="border-[3px] border-edge px-3 py-2 font-display text-[9px] uppercase tracking-wider text-faded transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
              >
                {action.label}
              </button>
            ))}
            {LIVE_STATUSES.includes(offer.status) ? (
              <button
                type="button"
                disabled={pending || armed !== null}
                onClick={() => void markContacted()}
                className="border-[3px] border-edge px-3 py-2 font-display text-[9px] uppercase tracking-wider text-faded transition-colors hover:border-mint hover:text-mint disabled:cursor-not-allowed disabled:opacity-50"
              >
                Mark contacted
              </button>
            ) : null}
          </div>

          {armed === "meetup_scheduled" ? (
            <div className="mt-4 border-[3px] border-edge p-3">
              <label htmlFor="meetup-location" className={labelClass}>
                General meetup area (private — never an exact address)
              </label>
              <input
                id="meetup-location"
                className={`${inputClass} mt-2`}
                value={armedText}
                maxLength={200}
                placeholder="e.g. north Austin, near the Domain"
                onChange={(e) => setArmedText(e.target.value)}
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void confirmArmed()}
                  className="border-[3px] border-accent bg-accent px-4 py-2 font-display text-[9px] uppercase tracking-wider text-black transition-colors hover:bg-transparent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending ? "Working…" : "Confirm meetup"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setArmed(null);
                    setArmedText("");
                  }}
                  className="border-[3px] border-edge px-4 py-2 font-display text-[9px] uppercase tracking-wider text-faded transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {armed === "did_not_complete" ? (
            <div className="mt-4 border-[3px] border-edge p-3">
              <label htmlFor="walkaway-reason" className={labelClass}>
                Why did the trade not complete? (private)
              </label>
              <textarea
                id="walkaway-reason"
                rows={2}
                className={`${inputClass} mt-2`}
                value={armedText}
                maxLength={2000}
                placeholder="e.g. either party walked away after inspection; item condition did not match"
                onChange={(e) => setArmedText(e.target.value)}
              />
              <p className="mt-2 text-[11px] text-faded">
                Closing an offer here changes nothing publicly — the current
                item, value and trade count stay exactly as they are.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void confirmArmed()}
                  className="border-[3px] border-alert bg-alert px-4 py-2 font-display text-[9px] uppercase tracking-wider text-black transition-colors hover:bg-transparent hover:text-alert disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {pending ? "Working…" : "Confirm did not complete"}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setArmed(null);
                    setArmedText("");
                  }}
                  className="border-[3px] border-edge px-4 py-2 font-display text-[9px] uppercase tracking-wider text-faded transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {offer.status === "completed" ? (
            <p className="mt-3 text-xs text-faded">
              Completed offers are locked here — their outcome moves through
              the trade-completion workflow.
            </p>
          ) : null}
          {offer.status === "invalid" ? (
            <p className="mt-3 text-xs text-faded">
              Invalid offers are terminal. Rare corrections can be made by a
              developer directly in Supabase.
            </p>
          ) : null}
          {offer.status === "selected" || offer.status === "meetup_scheduled" ? (
            <Link
              href={`/admin/trades/new/?offer=${offer.id}`}
              className="mt-4 inline-block border-[3px] border-mint bg-mint px-4 py-3 font-display text-[9px] uppercase tracking-wider text-black transition-colors hover:bg-transparent hover:text-mint sm:text-[10px]"
            >
              Complete Trade →
            </Link>
          ) : null}
        </Panel>
      </section>

      {offer.last_contacted_at !== null ||
      offer.meetup_scheduled_at !== null ||
      offer.meetup_general_location !== null ||
      offer.did_not_complete_reason !== null ? (
        <section aria-label="Workflow trail" className="mt-6">
          <Panel className="p-4">
            <p className={labelClass}>Workflow trail (private)</p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Last contacted">
                <Value>
                  {offer.last_contacted_at ? formatDateTime(offer.last_contacted_at) : "—"}
                </Value>
              </Field>
              <Field label="Meetup scheduled">
                <Value>
                  {offer.meetup_scheduled_at ? formatDateTime(offer.meetup_scheduled_at) : "—"}
                </Value>
              </Field>
              <Field label="Meetup area (private — never public)">
                <Value>{offer.meetup_general_location ?? "—"}</Value>
              </Field>
              <Field label="Did-not-complete reason">
                <Value>{offer.did_not_complete_reason ?? "—"}</Value>
              </Field>
            </div>
          </Panel>
        </section>
      ) : null}

      <section aria-label="Submitted offer" className="mt-6">
        <Panel className="p-4">
          <p className={labelClass}>Submitted offer</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Claimed value">
              <Value>{formatUsd(offer.claimed_value)}</Value>
            </Field>
            <Field label="Verified value">
              <Value>{offer.verified_value === null ? "—" : formatUsd(offer.verified_value)}</Value>
            </Field>
            <Field label="Condition">
              <Value>{offer.condition}</Value>
            </Field>
            <Field label="In person">
              <Value>{offer.in_person ? "Yes" : "No"}</Value>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Item description">
                <Value>{offer.item_description}</Value>
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Why this is a good trade">
                <Value>{offer.why_good_trade}</Value>
              </Field>
            </div>
            <Field label="Location">
              <Value>
                {offer.city}, {offer.state}
                {offer.zip ? ` ${offer.zip}` : ""}
              </Value>
            </Field>
            <Field label="Travel distance">
              <Value>{offer.travel_distance ?? "—"}</Value>
            </Field>
            <Field label="Serial / model">
              <Value>{offer.serial_or_model ?? "—"}</Value>
            </Field>
            <Field label="Comparable link">
              {offer.comp_url ? (
                <a
                  href={offer.comp_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-sm text-accent underline"
                >
                  {offer.comp_url}
                </a>
              ) : (
                <Value>—</Value>
              )}
            </Field>
          </div>
        </Panel>
      </section>

      <section aria-label="Contact" className="mt-6">
        <Panel className="p-4">
          <p className={labelClass}>Contact (private)</p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <Value>{offer.name}</Value>
            </Field>
            <Field label="Email">
              <Value>{offer.email}</Value>
            </Field>
            <Field label="Phone">
              <Value>{offer.phone ?? "—"}</Value>
            </Field>
          </div>
        </Panel>
      </section>

      <section aria-label="Photos" className="mt-6">
        <Panel className="p-4">
          <p className={labelClass}>Photos (private, signed URLs)</p>
          {files.length === 0 ? (
            <p className="mt-3 text-sm text-faded">No photos were submitted.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {files.map((file) => (
                <li key={file.id}>
                  {file.signedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={file.signedUrl}
                      alt="Private offer upload"
                      className="aspect-square w-full border-[3px] border-edge object-cover"
                    />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center border-[3px] border-edge px-2 text-center text-xs text-faded">
                      Preview unavailable
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-faded">
            These links are private and expire shortly after loading.
          </p>
        </Panel>
      </section>

      <section aria-label="Private admin fields" className="mt-6">
        <Panel className="p-4">
          <p className={labelClass}>Private admin fields</p>
          <div className="mt-3 grid gap-4">
            <Field label="Verified value (USD)">
              <input
                type="number"
                min="0"
                step="1"
                className={inputClass}
                value={verifiedValue}
                onChange={(e) => setVerifiedValue(e.target.value)}
              />
            </Field>
            <Field label="Verification method">
              <input
                className={inputClass}
                value={verificationMethod}
                maxLength={500}
                onChange={(e) => setVerificationMethod(e.target.value)}
              />
            </Field>
            <Field label="Authenticity / ownership notes">
              <textarea
                rows={3}
                className={inputClass}
                value={authenticityNotes}
                maxLength={2000}
                onChange={(e) => setAuthenticityNotes(e.target.value)}
              />
            </Field>
            <Field label="Risk flags">
              <textarea
                rows={2}
                className={inputClass}
                value={riskFlags}
                maxLength={2000}
                onChange={(e) => setRiskFlags(e.target.value)}
              />
            </Field>
            <Field label="Contact notes">
              <textarea
                rows={2}
                className={inputClass}
                value={contactNotes}
                maxLength={2000}
                onChange={(e) => setContactNotes(e.target.value)}
              />
            </Field>
            <Field label="Internal notes">
              <textarea
                rows={3}
                className={inputClass}
                value={internalNotes}
                maxLength={4000}
                onChange={(e) => setInternalNotes(e.target.value)}
              />
            </Field>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => void saveNotes()}
            className="mt-4 border-[3px] border-accent bg-accent px-5 py-3 font-display text-[10px] uppercase tracking-wider text-black transition-colors hover:bg-transparent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? "Working…" : "Save private fields"}
          </button>
          <p className="mt-2 text-xs text-faded">
            These fields are private and never appear publicly.
          </p>
        </Panel>
      </section>
    </main>
  );
}
