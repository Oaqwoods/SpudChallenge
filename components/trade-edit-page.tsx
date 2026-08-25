"use client";

// Resolves ?id=<uuid> (static hosting: ids travel as query parameters) and
// mounts the safe-edit form for that published trade.

import { useEffect, useState } from "react";
import Link from "next/link";
import { uuidFromQuery } from "@/lib/admin-offers";
import { TradeEditForm } from "@/components/trade-edit-form";
import { Panel } from "@/components/ui";

export function TradeEditPage() {
  const [tradeId, setTradeId] = useState<string | null | "resolving">("resolving");

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      await Promise.resolve();
      const id = uuidFromQuery(window.location.search, "id");
      if (!cancelled) setTradeId(id);
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  if (tradeId === "resolving") {
    return (
      <Panel className="p-8 text-center" aria-hidden="true">
        <p className="font-display text-xs text-faded">LOADING…</p>
      </Panel>
    );
  }

  if (tradeId === null) {
    return (
      <Panel className="p-8 text-center">
        <p className="font-display text-xs text-accent">NO TRADE SELECTED</p>
        <p className="mt-4 text-sm text-faded">
          Open a trade from the trades list to edit it.
        </p>
        <Link href="/admin/trades/" className="mt-6 inline-block text-sm text-accent underline">
          ← Back to trades
        </Link>
      </Panel>
    );
  }

  return <TradeEditForm tradeId={tradeId} />;
}
