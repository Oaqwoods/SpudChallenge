"use client";

// Admin overview (playbook prompt 9): challenge state + countdown, current
// item, offer counters, and the filterable/sortable offer list with quick
// status actions. Every query runs with the admin session JWT and is
// enforced by RLS is_admin() policies. No automatic scoring — humans decide.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useNow } from "@/hooks/use-now";
import {
  DEFAULT_SETTINGS,
  getPhase,
  toSettings,
  type ChallengeSettings,
} from "@/lib/challenge";
import { formatUsd } from "@/lib/format";
import { formatDateTime, padTwo, splitDuration } from "@/lib/time";
import { getSupabase } from "@/lib/supabase";
import { fetchAllRows, type PaginatedClient } from "@/lib/admin-export";
import { LIST_PAGE_SIZE, pageSlice, pageSummary } from "@/lib/pagination";
import { ExportCsvButton } from "@/components/export-csv-button";
import {
  OFFER_SORT_LABELS,
  OFFER_STATUSES,
  OFFER_STATUS_LABELS,
  availableActions,
  canSetStatus,
  countByStatus,
  filterOffers,
  isPrelaunchOffer,
  sortOffers,
  toAdminOffer,
  type AdminOfferRow,
  type OfferSort,
  type OfferStatus,
} from "@/lib/admin-offers";
import { Panel } from "@/components/ui";

// List-only columns (name/email are included for search). Full rows are
// fetched on the offer detail page.
const OFFER_COLUMNS = [
  "id",
  "name",
  "email",
  "item_name",
  "claimed_value",
  "verified_value",
  "condition",
  "city",
  "state",
  "in_person",
  "status",
  "created_at",
].join(", ");

const inputClass =
  "w-full border-[3px] border-edge bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent";
const labelClass = "font-display text-[8px] uppercase text-faded sm:text-[9px]";
const actionButtonClass =
  "border-2 border-edge px-2 py-1 font-display text-[7px] uppercase tracking-wider text-faded transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 sm:text-[8px]";

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

type LoadState =
  | { phase: "loading" }
  | { phase: "unconfigured" }
  | { phase: "error"; message: string }
  | {
      phase: "ready";
      settings: ChallengeSettings;
      offers: AdminOfferRow[];
      followerCount: number | null;
    };

function StatusBadge({ status }: { status: OfferStatus }) {
  return (
    <span
      className={`inline-block border-2 px-2 py-0.5 font-display text-[7px] uppercase sm:text-[8px] ${STATUS_BADGE[status]}`}
    >
      {OFFER_STATUS_LABELS[status]}
    </span>
  );
}

function PhaseBadge({ settings, now }: { settings: ChallengeSettings; now: number | null }) {
  const phase = now !== null ? getPhase(settings, now) : settings.status;
  const tone =
    phase === "active" ? "border-mint text-mint" : phase === "complete" ? "border-accent text-accent" : "border-faded text-faded";
  return (
    <span className={`inline-block border-2 px-2 py-0.5 font-display text-[8px] uppercase ${tone}`}>
      {phase === "active" ? "Active" : phase === "complete" ? "Complete" : "Prelaunch"}
    </span>
  );
}

function CountdownValue({ settings, now }: { settings: ChallengeSettings; now: number | null }) {
  if (now === null) return <span aria-hidden="true">--</span>;
  const phase = getPhase(settings, now);
  if (phase === "complete") return <span className="text-mint">COMPLETE</span>;
  const targetIso = phase === "active" ? settings.end_at : settings.start_at;
  const target = targetIso ? Date.parse(targetIso) : Number.NaN;
  if (Number.isNaN(target)) return <span className="text-faded">TBA</span>;
  const d = splitDuration(target - now);
  return (
    <span>
      {d.days}d {padTwo(d.hours)}h {padTwo(d.minutes)}m {padTwo(d.seconds)}s
    </span>
  );
}

function Stat({ label, value, tone = "text-accent" }: { label: string; value: string; tone?: string }) {
  return (
    <Panel className="px-3 py-4 text-center">
      <div className={`font-display text-xl sm:text-2xl ${tone}`}>{value}</div>
      <div className="mt-2 font-display text-[8px] uppercase text-faded">{label}</div>
    </Panel>
  );
}

// Fetch-only (no setState): the caller awaits this and applies the result,
// so state updates always happen after the network round trip.
async function fetchDashboardState(): Promise<LoadState> {
  const supabase = getSupabase();
  if (!supabase) return { phase: "unconfigured" };
  const client = supabase as unknown as PaginatedClient;
  // Offers are fetched page by page (no silent .limit() cap) so the list can
  // never hide rows; the render itself is paginated below (prompt 27).
  const [settingsRes, offersRes, followerRes] = await Promise.all([
    supabase.from("challenge_settings").select("*").eq("id", 1).maybeSingle(),
    fetchAllRows(client, "offers", "created_at", OFFER_COLUMNS),
    supabase.from("public_follower_count").select("follower_count").maybeSingle(),
  ]);
  const error = settingsRes.error ?? followerRes.error;
  if (error || offersRes.error) {
    return {
      phase: "error",
      message: `Could not load the dashboard (${error?.message ?? offersRes.error}). Check your session and try again.`,
    };
  }
  const settings = settingsRes.data
    ? toSettings(settingsRes.data as Record<string, unknown>)
    : DEFAULT_SETTINGS;
  // Column list is dynamic, so supabase-js cannot type the rows; they are
  // validated field-by-field by toAdminOffer below.
  const rawOffers = offersRes.rows;
  const offers = rawOffers
    .map(toAdminOffer)
    .filter((offer): offer is AdminOfferRow => offer !== null);
  const followerCount = followerRes.data
    ? Number((followerRes.data as { follower_count: unknown }).follower_count)
    : null;
  return {
    phase: "ready",
    settings,
    offers,
    followerCount: Number.isFinite(followerCount) ? followerCount : null,
  };
}

export function AdminDashboard() {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [statusFilter, setStatusFilter] = useState<OfferStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<OfferSort>("newest");
  const [page, setPage] = useState(1);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const now = useNow(1000);

  const refresh = async () => {
    setState({ phase: "loading" });
    const next = await fetchDashboardState();
    setState(next);
  };

  useEffect(() => {
    let cancelled = false;
    const initialLoad = async () => {
      const next = await fetchDashboardState();
      if (!cancelled) setState(next);
    };
    void initialLoad();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyStatus = async (offer: AdminOfferRow, next: OfferStatus) => {
    if (
      state.phase !== "ready" ||
      !canSetStatus(offer.status, next, state.settings.status)
    ) {
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    setPendingId(offer.id);
    setNotice(null);
    const { error } = await supabase.from("offers").update({ status: next }).eq("id", offer.id);
    setPendingId(null);
    if (error) {
      setNotice({ tone: "error", text: `Could not update “${offer.item_name}” — ${error.message}` });
      return;
    }
    setNotice({
      tone: "ok",
      text: `Status set to “${OFFER_STATUS_LABELS[next]}” for “${offer.item_name}”.`,
    });
    setState((prev) =>
      prev.phase === "ready"
        ? {
            ...prev,
            offers: prev.offers.map((o) => (o.id === offer.id ? { ...o, status: next } : o)),
          }
        : prev,
    );
  };

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
          <p className="font-display text-xs text-accent">DASHBOARD UNAVAILABLE</p>
          <p className="mt-4 text-sm leading-relaxed text-faded">
            {state.phase === "unconfigured"
              ? "Admin is not configured yet (missing Supabase configuration)."
              : state.message}
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-6 border-[3px] border-accent bg-accent px-4 py-2 font-display text-[9px] uppercase tracking-wider text-black transition-colors hover:bg-transparent hover:text-accent sm:text-[10px]"
          >
            Try again
          </button>
        </Panel>
      </main>
    );
  }

  const { settings, offers, followerCount } = state;
  const counts = countByStatus(offers);
  const visible = sortOffers(filterOffers(offers, { status: statusFilter, query }), sort);
  const totalPages = Math.max(1, Math.ceil(visible.length / LIST_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = pageSlice(visible, safePage, LIST_PAGE_SIZE);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-base text-accent sm:text-lg">DASHBOARD</h1>
        <div className="flex items-center gap-3">
          <Link href="/admin/settings/" className="text-xs text-faded underline hover:text-accent">
            Launch controls
          </Link>
          <Link href="/admin/trades/" className="text-xs text-faded underline hover:text-accent">
            Trades
          </Link>
          <Link href="/admin/followers/" className="text-xs text-faded underline hover:text-accent">
            Followers
          </Link>
          <Link href="/admin/emails/" className="text-xs text-faded underline hover:text-accent">
            Email broadcasts
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

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel className="p-6">
          <p className={labelClass}>Challenge</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <PhaseBadge settings={settings} now={now} />
            <p className="font-display text-sm text-foreground sm:text-base">
              <CountdownValue settings={settings} now={now} />
            </p>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-faded">
            {settings.start_at ? `Starts ${formatDateTime(settings.start_at)}` : "Start date TBA"}
            {settings.end_at ? ` · Ends ${formatDateTime(settings.end_at)}` : ""}
          </p>
          {settings.offers_paused ? (
            <p className="mt-2 text-xs text-alert">Offers are currently paused.</p>
          ) : null}
        </Panel>
        <Panel className="p-6">
          <p className={labelClass}>Current item</p>
          <p className="mt-3 font-display text-sm text-accent sm:text-base">
            {settings.current_item_name}
          </p>
          <p className="mt-2 font-display text-lg text-foreground">
            {formatUsd(settings.current_item_value)}
          </p>
          <p className="mt-2 text-xs text-faded">Trade #{settings.current_trade_number}</p>
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4">
        <Stat label="New offers" value={String(counts.new ?? 0)} />
        <Stat label="Shortlisted" value={String(counts.shortlisted ?? 0)} tone="text-mint" />
        <Stat label="Followers" value={followerCount === null ? "—" : String(followerCount)} />
      </div>

      <section aria-label="Offers" className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-xs uppercase tracking-widest text-accent sm:text-sm">
            <span aria-hidden="true">▸ </span>Offers ({offers.length})
          </h2>
          <ExportCsvButton kind="offers" />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="offer-status-filter" className={labelClass}>Status</label>
            <select
              id="offer-status-filter"
              className={inputClass}
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as OfferStatus | "all");
                setPage(1);
              }}
            >
              <option value="all">All statuses</option>
              {OFFER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {OFFER_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="offer-search" className={labelClass}>Search</label>
            <input
              id="offer-search"
              className={inputClass}
              value={query}
              maxLength={200}
              placeholder="Item, name, email, city…"
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="offer-sort" className={labelClass}>Sort</label>
            <select
              id="offer-sort"
              className={inputClass}
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as OfferSort);
                setPage(1);
              }}
            >
              {(Object.keys(OFFER_SORT_LABELS) as OfferSort[]).map((key) => (
                <option key={key} value={key}>
                  {OFFER_SORT_LABELS[key]}
                </option>
              ))}
            </select>
          </div>
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

        {settings.status === "prelaunch" ? (
          <p className="mt-4 border-[3px] border-accent bg-panel px-3 py-2 text-xs leading-relaxed text-accent">
            Prelaunch: offers below are collected only and stay frozen at their
            current status. Workflow actions unlock once you START CHALLENGE
            NOW — collecting offers never starts the clock.
          </p>
        ) : null}

        {offers.length === 0 ? (
          <Panel className="mt-4 p-8 text-center">
            <p className="text-sm text-faded">
              No offers yet — submissions appear here the moment they arrive.
            </p>
          </Panel>
        ) : visible.length === 0 ? (
          <Panel className="mt-4 p-8 text-center">
            <p className="text-sm text-faded">No offers match the current filters.</p>
          </Panel>
        ) : (
          <Panel className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b-[3px] border-edge font-display text-[8px] uppercase text-faded">
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Claimed</th>
                  <th className="px-3 py-2">Verified</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">In person</th>
                  <th className="px-3 py-2">Submitted</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paged.map((offer) => (
                  <OfferRow
                    key={offer.id}
                    offer={offer}
                    busy={pendingId === offer.id}
                    challengeStatus={settings.status}
                    startAt={settings.start_at}
                    onStatus={(next) => void applyStatus(offer, next)}
                  />
                ))}
              </tbody>
            </table>
          </Panel>
        )}

        {visible.length > LIST_PAGE_SIZE ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-faded">
              {pageSummary(visible.length, safePage, LIST_PAGE_SIZE)}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="border-[3px] border-edge px-3 py-1.5 font-display text-[9px] uppercase tracking-wider text-faded transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 sm:text-[10px]"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
              >
                ← Prev
              </button>
              <span className="text-xs text-faded">
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                className="border-[3px] border-edge px-3 py-1.5 font-display text-[9px] uppercase tracking-wider text-faded transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 sm:text-[10px]"
                disabled={safePage >= totalPages}
                onClick={() => setPage(safePage + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        ) : null}

        <p className="mt-3 text-xs leading-relaxed text-faded">
          Status changes here never publish anything publicly. Offers are never
          accepted automatically.
        </p>
      </section>
    </main>
  );
}

function OfferRow({
  offer,
  busy,
  challengeStatus,
  startAt,
  onStatus,
}: {
  offer: AdminOfferRow;
  busy: boolean;
  challengeStatus: string;
  startAt: string | null;
  onStatus: (next: OfferStatus) => void;
}) {
  const submitted = new Date(offer.created_at);
  const submittedLabel = Number.isNaN(submitted.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
        submitted,
      );

  return (
    <tr className="border-b border-edge align-top">
      <td className="px-3 py-3">
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={offer.status} />
          {isPrelaunchOffer(offer.created_at, startAt) ? (
            <span className="inline-block border-2 border-faded px-2 py-0.5 font-display text-[7px] uppercase text-faded sm:text-[8px]">
              Prelaunch
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-3">
        <p className="text-foreground">{offer.item_name}</p>
        <p className="mt-1 text-xs text-faded">{offer.condition}</p>
      </td>
      <td className="px-3 py-3 font-display text-xs text-foreground">
        {formatUsd(offer.claimed_value)}
      </td>
      <td className="px-3 py-3 font-display text-xs text-mint">
        {offer.verified_value === null ? "—" : formatUsd(offer.verified_value)}
      </td>
      <td className="px-3 py-3 text-xs text-faded">
        {offer.city}, {offer.state}
      </td>
      <td className="px-3 py-3 text-xs text-faded">{offer.in_person ? "Yes" : "—"}</td>
      <td className="px-3 py-3 text-xs text-faded">{submittedLabel}</td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1">
          <Link href={`/admin/offers/?id=${offer.id}`} className={actionButtonClass}>
            Open
          </Link>
          {availableActions(offer.status, challengeStatus).map((action) => (
            <button
              key={action.status}
              type="button"
              disabled={busy}
              onClick={() => onStatus(action.status)}
              className={`${actionButtonClass} ${
                action.status === "declined" ? "hover:border-alert hover:text-alert" : ""
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
}
