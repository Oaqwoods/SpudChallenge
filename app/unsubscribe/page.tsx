import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { UnsubscribeTool } from "@/components/unsubscribe-tool";
import { Panel } from "@/components/ui";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

export default function UnsubscribePage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <Link href="/" className="text-sm text-faded hover:text-accent">
        ← Back to the challenge
      </Link>
      <h1 className="mt-6 font-display text-base text-accent sm:text-lg">UNSUBSCRIBE</h1>
      <Suspense
        fallback={<Panel className="mt-6 p-5 text-sm text-faded">Loading…</Panel>}
      >
        <UnsubscribeTool />
      </Suspense>
    </main>
  );
}
