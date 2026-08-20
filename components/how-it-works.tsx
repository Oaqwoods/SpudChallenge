import { Panel, SectionHeading } from "@/components/ui";

const STEPS = [
  "See what we currently have.",
  "Offer something better.",
  "We review the offers.",
  "If selected, we verify and arrange the trade.",
  "The completed trade becomes the new challenge item.",
  "Repeat until time runs out.",
];

export function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-heading" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-8">
      <SectionHeading id="how-heading">How It Works</SectionHeading>
      <Panel className="mt-4 p-5">
        <ol className="grid gap-4 sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span aria-hidden="true" className="font-display text-sm text-accent">
                {i + 1}
              </span>
              <span className="text-sm leading-relaxed text-foreground">{step}</span>
            </li>
          ))}
        </ol>
      </Panel>
    </section>
  );
}
