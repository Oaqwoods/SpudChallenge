import Link from "next/link";
import { Panel, SectionHeading } from "@/components/ui";

export const PUBLIC_RULES: string[] = [
  "We start with $1.",
  "We can only trade what we currently own.",
  "No adding cash to a trade.",
  "Every trade must be real.",
  "You must own what you offer.",
  "We choose the trade that best advances the challenge.",
  "Values must be reasonably defensible.",
  "Publicity does not count toward asset value.",
  "Illegal, stolen, counterfeit, unsafe, or prohibited property is rejected.",
  "Completed trades are final.",
  "The 21-day clock never resets.",
  "The final asset remains ours even if the $5M target is not reached.",
];

export const BITCOIN_NOTE =
  "Bitcoin (BTC) is the only permitted cryptocurrency asset. It may be received or traded away as the current asset like any other asset, but BTC can never be added to a trade as supplemental consideration alongside another asset — the challenge only trades what it currently owns.";

export function RulesList() {
  return (
    <ol className="grid gap-3">
      {PUBLIC_RULES.map((rule, i) => (
        <li key={i} className="flex items-start gap-3">
          <span aria-hidden="true" className="font-display text-xs text-accent">
            {String(i + 1).padStart(2, "0")}
          </span>
          <span className="text-sm leading-relaxed text-foreground">{rule}</span>
        </li>
      ))}
    </ol>
  );
}

export default function RulesSection() {
  return (
    <section id="rules" aria-labelledby="rules-heading" className="mx-auto max-w-3xl px-4 py-8">
      <SectionHeading id="rules-heading">Rules</SectionHeading>
      <Panel className="mt-4 p-5">
        <RulesList />
      </Panel>
      <Panel className="mt-3 p-4">
        <p className="text-sm leading-relaxed text-faded">
          <span className="font-display text-[9px] uppercase text-accent">Bitcoin note · </span>
          {BITCOIN_NOTE}
        </p>
      </Panel>
      <p className="mt-3 text-xs text-faded">
        These public rules are a summary and not a substitute for the detailed{" "}
        <Link href="/terms/" className="text-accent underline">
          Terms of Participation
        </Link>
        .
      </p>
    </section>
  );
}
