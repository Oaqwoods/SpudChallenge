import type { Metadata } from "next";
import Link from "next/link";
import { TradeEditPage } from "@/components/trade-edit-page";

export const metadata: Metadata = {
  title: "Edit Trade",
};

export default function TradeEditRoute() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/admin/trades/" className="text-sm text-faded hover:text-accent">
        ← Back to trades
      </Link>
      <h1 className="mt-4 font-display text-base text-accent sm:text-lg">EDIT PUBLISHED TRADE</h1>
      <div className="mt-6">
        <TradeEditPage />
      </div>
    </main>
  );
}
