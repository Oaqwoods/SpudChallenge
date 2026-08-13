import type { Metadata } from "next";
import Link from "next/link";
import { CompleteTradePage } from "@/components/complete-trade-page";

export const metadata: Metadata = {
  title: "Complete Trade",
};

export default function CompleteTradeRoute() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/admin/" className="text-sm text-faded hover:text-accent">
        ← Back to the dashboard
      </Link>
      <h1 className="mt-4 font-display text-base text-accent sm:text-lg">COMPLETE TRADE</h1>
      <div className="mt-6">
        <CompleteTradePage />
      </div>
    </main>
  );
}
