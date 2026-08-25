"use client";

// Admin trades list (playbook PROMPT 27): every published trade with its
// recorded values, valuation status, and an entry point to the safe-edit
// screen. Trades are never hard-deleted; corrections go through the edit
// RPC, and historical-value changes require explicit confirmation there.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui";
import { getSupabase } from "@/lib/supabase";
import { formatUsd } from "@/lib/format";
import { formatDateTime } from "@/lib/time";
import { fetchAllRows, type PaginatedClient } from "@/lib/admin-export";
import { toAdminTrade, type AdminTradeRow } from "@/lib/admin-trades";
import { LIST_PAGE_SIZE, pageSlice, pageSummary } from "@/lib/pagination";
import { ExportCsvButton } from "@/components/export-csv-button";

const pagerButtonClass =
  "border-[3px] border-edge px-3 py-1.5 font-display text-[9px] uppercase tracking-wider text-faded transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 sm:text-[10px]";

type LoadState =
  | { phase: "loading" }
  | { phase: "unconfigured" }
  | { phase: "error"; message: string }
  | { phase: "ready"; trades: AdminTradeRow[] };

// Fetch-only (no setState): the caller awaits this and applies the result.
async function fetchTrades(): Promise<LoadState> {
  const supabase = getSupabase();
  if (!supabase) return { phase: "unconfigured" };
  const client = supabase as unknown as PaginatedClient;
  const { rows, error } = await fetchAllRows(client, "trades", "trade_number");
  if (error) {
    return {
      phase: "error",
      message: `Could not load trades (${error}). Check your session and try again.`,
    };
  }
  const trades = rows
    .map(toAdminTrade)
    .filter((t): t is AdminTradeRow => t !== null);
  return { phase: "ready", trades };
}

function ValuationBadge({ status }: { status: AdminTradeRow["valuation_status"] }) {
  const tone = status === "verified" ? "border-mint text-mint" : "border-faded text-faded";
  return (
    <span className={`inline-block border-2 px-2 py-0.5 font-display text-[7px] uppercase sm:text-[8px] ${tone}`}>
      {status}
    </span>
  );
}

export function AdminTrades() {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [page, setPage] = useState(1);

  const refresh = async () => {
    setState({ phase: "loading" });
    const next = await fetchTrades();
    setState(next);
  };

  useEffect(() => {
    let cancelled = false;
    const initialLoad = async () => {
      const next = await fetchTrades();
      if (!cancelled) setState(next);
    };
    void initialLoad();
    return () => {
      cancelled = true;
    };
  }, []);

  // Newest trade first.
  const ordered = useMemo(
    () => (state.phase === "ready" ? [...state.trades].sort((a, b) => b.trade_number - a.trade_number) : []),
    [state],
  );
  const visible = pageSlice(ordered, page, LIST_PAGE_SIZE);

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
          <p className="font-display text-xs text-accent">TRADES UNAVAILABLE</p>
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

  const totalPages = Math.max(1, Math.ceil(ordered.length / LIST_PAGE_SIZE));

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-base text-accent sm:text-lg">TRADES</h1>
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

      <div className="mt-6">
        <ExportCsvButton kind="trades" />
      </div>

      {ordered.length === 0 ? (
        <Panel className="mt-4 p-8 text-center">
          <p className="text-sm text-faded">
            No published trades yet. Complete a selected offer to publish the first one.
          </p>
        </Panel>
      ) : (
        <>
          <Panel className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b-[3px] border-edge font-display text-[8px] uppercase text-faded">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Completed</th>
                  <th className="px-3 py-2">Trade</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2">Valuation</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((trade) => (
                  <tr key={trade.id} className="border-b border-edge align-top">
                    <td className="px-3 py-3 font-display text-xs text-accent">#{trade.trade_number}</td>
                    <td className="px-3 py-3 text-xs text-faded">
                      {trade.completed_at ? formatDateTime(trade.completed_at) : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-foreground">{trade.outgoing_item}</p>
                      <p className="mt-1 text-xs text-faded">→ {trade.incoming_item}</p>
                    </td>
                    <td className="px-3 py-3 font-display text-xs text-foreground">
                      {formatUsd(trade.outgoing_value)} → {formatUsd(trade.incoming_value)}
                    </td>
                    <td className="px-3 py-3">
                      <ValuationBadge status={trade.valuation_status} />
                    </td>
                    <td className="px-3 py-3 text-xs text-faded">{trade.general_location}</td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/admin/trades/edit/?id=${trade.id}`}
                        className="border-2 border-edge px-2 py-1 font-display text-[7px] uppercase tracking-wider text-faded transition-colors hover:border-accent hover:text-accent sm:text-[8px]"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-faded">{pageSummary(ordered.length, page, LIST_PAGE_SIZE)}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={pagerButtonClass}
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Prev
              </button>
              <span className="text-xs text-faded">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className={pagerButtonClass}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}

      <p className="mt-3 text-xs leading-relaxed text-faded">
        Published trades are never hard-deleted. Edit corrects typos, photos,
        and the story; changing a historical value asks for explicit
        confirmation, and BTC fair-market values are locked.
      </p>
    </main>
  );
}
