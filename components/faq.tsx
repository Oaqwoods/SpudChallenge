import { Panel, SectionHeading } from "@/components/ui";

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "What counts as a better trade?",
    a: "An item with higher defensible market value that we can verify and trade again. We weigh value, verifiability, and how far it can take the chain.",
  },
  {
    q: "Do you have to take the highest-value offer?",
    a: "No. We choose the trade that best advances the challenge — value, verification, and logistics all matter.",
  },
  {
    q: "Can I offer something from outside the local area?",
    a: "Yes, but logistics matter. We prioritize trades that can actually be inspected and transferred safely.",
  },
  {
    q: "Are you prioritizing in-person trades?",
    a: "Yes, especially early in the challenge.",
  },
  {
    q: "Can I offer cash?",
    a: "No. We can only trade what we currently own for something better — cash offers are not accepted.",
  },
  {
    q: "Can I add cash to a trade?",
    a: "No. No cash may be added to either side of a trade.",
  },
  {
    q: "What happens when the 21 days end?",
    a: "The challenge completes. We display the final asset, its value, the total multiplier, and whether the $5M goal was reached.",
  },
  {
    q: "Do completed trades reverse if the challenge fails?",
    a: "No. Completed trades remain completed. Failure means only that the $5M goal was not reached within 21 days.",
  },
  {
    q: "How do you determine value?",
    a: "Values must be reasonably defensible — market comparables and, where possible, verification. The public scoreboard always uses the final admin-recorded challenge value, and values are labeled estimated or verified.",
  },
  {
    q: "What happens with cars, real estate, businesses, or other complicated assets?",
    a: "They may be traded, but complex transfers can require professional verification or closing, and the transfer must be genuinely completed before it counts.",
  },
  {
    q: "How can I follow every trade?",
    a: "Use FOLLOW THE CHALLENGE below — every completed trade is emailed to subscribers.",
  },
];

export function FaqSection() {
  return (
    <section aria-label="Frequently asked questions" className="mx-auto max-w-3xl px-4 py-8">
      <SectionHeading>FAQ</SectionHeading>
      <div className="mt-4 flex flex-col gap-3">
        {FAQ.map(({ q, a }) => (
          <Panel key={q}>
            <details className="group p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-display text-[10px] uppercase leading-relaxed text-foreground sm:text-xs">
                {q}
                <span aria-hidden="true" className="text-accent group-open:hidden">
                  +
                </span>
                <span aria-hidden="true" className="hidden text-accent group-open:inline">
                  −
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-faded">{a}</p>
            </details>
          </Panel>
        ))}
      </div>
    </section>
  );
}
