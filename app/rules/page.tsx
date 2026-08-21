import type { Metadata } from "next";
import Link from "next/link";
import { TrackOnMount } from "@/components/analytics-tracker";
import { RulesList, BITCOIN_NOTE } from "@/components/rules";
import { Panel } from "@/components/ui";

export const metadata: Metadata = {
  title: "Public Rules",
  description: "The public rules of the ONE → FIVE 21-day trade challenge.",
  alternates: { canonical: "/rules/" },
};

export default function RulesPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <TrackOnMount event="rules_viewed" />
      <Link href="/" className="text-sm text-faded hover:text-accent">
        ← Back to the challenge
      </Link>
      <h1 className="mt-6 font-display text-base text-accent sm:text-lg">PUBLIC RULES</h1>
      <Panel className="mt-6 border-alert p-4">
        <p className="font-display text-[9px] uppercase text-alert sm:text-[10px]">
          Placeholder — pending attorney review
        </p>
        <p className="mt-2 text-sm leading-relaxed text-faded">
          These rules are an operating draft. Final attorney-reviewed copy is
          still required before launch, and this page may change until then.
        </p>
      </Panel>
      <Panel className="mt-3 p-5">
        <RulesList />
      </Panel>
      <Panel className="mt-3 p-4">
        <p className="text-sm leading-relaxed text-faded">
          <span className="font-display text-[9px] uppercase text-accent">Bitcoin note · </span>
          {BITCOIN_NOTE}
        </p>
      </Panel>
      <p className="mt-4 text-xs text-faded">
        These public rules are a summary and not a substitute for the detailed{" "}
        <Link href="/terms/" className="text-accent underline">
          Terms of Participation
        </Link>
        .
      </p>
    </main>
  );
}
