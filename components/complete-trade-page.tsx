"use client";

// Resolves ?offer=<uuid> (static hosting: ids travel as query parameters)
// and mounts the completion form for that offer.

import { useEffect, useState } from "react";
import Link from "next/link";
import { uuidFromQuery } from "@/lib/admin-offers";
import { CompleteTradeForm } from "@/components/complete-trade-form";
import { Panel } from "@/components/ui";

export function CompleteTradePage() {
  const [offerId, setOfferId] = useState<string | null | "resolving">("resolving");

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      await Promise.resolve();
      const id = uuidFromQuery(window.location.search, "offer");
      if (!cancelled) setOfferId(id);
    };
    void resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  if (offerId === "resolving") {
    return (
      <Panel className="p-8 text-center" aria-hidden="true">
        <p className="font-display text-xs text-faded">LOADING…</p>
      </Panel>
    );
  }

  if (offerId === null) {
    return (
      <Panel className="p-8 text-center">
        <p className="font-display text-xs text-accent">NO OFFER SELECTED</p>
        <p className="mt-4 text-sm text-faded">
          Open an offer from the dashboard and use “Complete Trade” there.
        </p>
        <Link href="/admin/" className="mt-6 inline-block text-sm text-accent underline">
          ← Back to the dashboard
        </Link>
      </Panel>
    );
  }

  return <CompleteTradeForm offerId={offerId} />;
}
