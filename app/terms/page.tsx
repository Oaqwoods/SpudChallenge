import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/ui";

export const metadata: Metadata = {
  title: "Terms of Participation",
  description: "Terms of Participation for the $1 → $5M 21-day trade challenge.",
  alternates: { canonical: "/terms/" },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="font-display text-[10px] uppercase tracking-wider text-accent sm:text-xs">
        <span aria-hidden="true">▸ </span>{title}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-faded">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="text-sm text-faded hover:text-accent">
        ← Back to the challenge
      </Link>
      <h1 className="mt-6 font-display text-base text-accent sm:text-lg">
        TERMS OF PARTICIPATION
      </h1>

      <Panel className="mt-6 border-alert p-4">
        <p className="font-display text-[9px] uppercase text-alert sm:text-[10px]">
          Placeholder — pending attorney review
        </p>
        <p className="mt-2 text-sm leading-relaxed text-faded">
          The section structure below is an operating draft. Final
          attorney-reviewed copy is still required for every section before
          launch, and this page may change materially until then.
        </p>
      </Panel>

      <Panel className="mt-6 p-5">
        <Section title="What this is">
          <p>
            $1 → $5M is a promotional 21-day trade challenge run by the site
            operator (“we”). We start with $1 and attempt to trade up to
            $5,000,000 in 21 days by trading only what we currently own.
            Participation happens by submitting trade offers through this site;
            all actual transfers happen offline between the parties.
          </p>
        </Section>

        <Section title="Offers and acceptance">
          <p>
            Submitting an offer is a proposal only. We review every offer
            manually and choose, at our sole discretion, the trade that best
            advances the challenge. <strong className="text-foreground">Submitting an offer is not
            acceptance of a trade, and no offer is guaranteed to be accepted.</strong>
          </p>
        </Section>

        <Section title="Values">
          <p>
            Item values shown on this site are recorded by us and labeled
            estimated or verified. <strong className="text-foreground">No valuation on this site is
            guaranteed, warranted, or professional appraisal advice.</strong> Values
            may change and may differ from what any item could actually sell for.
          </p>
        </Section>

        <Section title="Transfers and safety">
          <p>
            Selected trades complete in person or by arrangements made directly
            between the parties. We coordinate logistics but transfers,
            inspection, transport, and any paperwork are the responsibility of
            the people involved. <strong className="text-foreground">We make no guarantee of safety,
            and nothing on this site is legal, security, or logistical advice.</strong>
          </p>
        </Section>

        <Section title="Ownership">
          <p>
            By offering an item you confirm that you own it and can legally
            transfer it. Nothing on this site is a conclusion about legal
            ownership, title, or authenticity of any item.
          </p>
        </Section>

        <Section title="Taxes and costs">
          <p>
            <strong className="text-foreground">We provide no tax advice.</strong> Any tax consequences of a
            trade are the responsibility of the parties to that trade. We do
            not pay fees, cover transport, or add cash to any trade.
          </p>
        </Section>

        <Section title="Finality">
          <p>
            Completed trades are final. If the $5,000,000 target is not reached
            within 21 days, completed trades remain completed — only the goal
            goes unreached.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            These terms may be updated as the challenge develops and as final
            legal copy lands. The version in effect is the one published here
            at the time you submit an offer.
          </p>
        </Section>
      </Panel>

      <p className="mt-6 text-xs text-faded">
        Questions about these terms? Contact the site operator through the
        channels listed on the challenge page.
      </p>
    </main>
  );
}
