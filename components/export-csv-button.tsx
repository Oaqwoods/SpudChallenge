"use client";

// Admin-only CSV export (playbook PROMPT 27). Exports are generated entirely
// in the browser from rows the signed-in admin client is already authorized
// to read (RLS is_admin()); nothing is sent to any server. The export
// includes private recordkeeping columns (contact data, admin notes, BTC
// verification fields) by design — it is the operator's own export and
// never leaves the admin session.

import { useState } from "react";
import { getSupabase } from "@/lib/supabase";
import {
  exportFilename,
  fetchAllRows,
  toCsv,
  type ExportKind,
  type PaginatedClient,
} from "@/lib/admin-export";
import {
  FOLLOWER_EXPORT_COLUMNS,
  OFFER_EXPORT_COLUMNS,
  TRADE_EXPORT_COLUMNS,
} from "@/lib/admin-export";

// Per-kind source table, deterministic ordering column, and curated column
// set. Keep in sync with lib/admin-export.
const EXPORT_SOURCES: Record<
  ExportKind,
  { table: string; orderColumn: string; columns: readonly string[] }
> = {
  offers: { table: "offers", orderColumn: "created_at", columns: OFFER_EXPORT_COLUMNS },
  followers: { table: "followers", orderColumn: "created_at", columns: FOLLOWER_EXPORT_COLUMNS },
  trades: { table: "trades", orderColumn: "trade_number", columns: TRADE_EXPORT_COLUMNS },
};

const buttonClass =
  "border-[3px] border-accent bg-accent px-4 py-2 font-display text-[9px] uppercase tracking-wider text-black transition-colors hover:bg-transparent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 sm:text-[10px]";

type ExportState =
  | { phase: "idle" }
  | { phase: "busy" }
  | { phase: "done"; message: string }
  | { phase: "error"; message: string };

export function ExportCsvButton({ kind }: { kind: ExportKind }) {
  const [state, setState] = useState<ExportState>({ phase: "idle" });

  const runExport = async () => {
    if (state.phase === "busy") return;
    const supabase = getSupabase();
    if (!supabase) {
      setState({ phase: "error", message: "Admin is not configured yet." });
      return;
    }
    setState({ phase: "busy" });
    const source = EXPORT_SOURCES[kind];
    // The supabase-js chain is structurally the paging client fetchAllRows
    // expects; the cast keeps lib/admin-export free of a supabase import.
    const client = supabase as unknown as PaginatedClient;
    const { rows, error } = await fetchAllRows(client, source.table, source.orderColumn);
    if (error) {
      setState({ phase: "error", message: `Export failed — ${error}` });
      return;
    }
    const csv = toCsv(source.columns, rows);
    const filename = exportFilename(kind);
    // Blob + object URL keeps the download local to this browser.
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Give the download a beat before releasing the object URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setState({ phase: "done", message: `Exported ${rows.length} ${kind}.` });
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={buttonClass}
        disabled={state.phase === "busy"}
        onClick={() => void runExport()}
      >
        {state.phase === "busy" ? "Exporting…" : `Export ${kind} CSV`}
      </button>
      {state.phase === "done" ? (
        <span role="status" className="text-xs text-mint">
          {state.message}
        </span>
      ) : null}
      {state.phase === "error" ? (
        <span role="alert" className="text-xs text-alert">
          {state.message}
        </span>
      ) : null}
    </span>
  );
}
