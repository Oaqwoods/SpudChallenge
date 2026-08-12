import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/ui";

export const metadata: Metadata = {
  title: "Terms of Participation",
  description: "Terms of Participation for the ONE → FIVE 21-day trade challenge.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="text-sm text-faded hover:text-accent">
        ← Back to the challenge
      </Link>
      <h1 className="mt-6 font-display text-base text-accent sm:text-lg">
        TERMS OF PARTICIPATION
      </h1>
      <Panel className="mt-6 p-5">
        <p className="text-sm leading-relaxed text-faded">
          Placeholder. Final Terms of Participation require attorney review
          before launch. Nothing on this page is a guarantee of valuation,
          acceptance, safety, tax treatment, or legal ownership.
        </p>
      </Panel>
    </main>
  );
}
