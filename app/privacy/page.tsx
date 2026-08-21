import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/ui";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy policy for the ONE → FIVE 21-day trade challenge.",
  alternates: { canonical: "/privacy/" },
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

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="text-sm text-faded hover:text-accent">
        ← Back to the challenge
      </Link>
      <h1 className="mt-6 font-display text-base text-accent sm:text-lg">PRIVACY POLICY</h1>

      <Panel className="mt-6 border-alert p-4">
        <p className="font-display text-[9px] uppercase text-alert sm:text-[10px]">
          Placeholder — pending attorney review
        </p>
        <p className="mt-2 text-sm leading-relaxed text-faded">
          This page describes how the site actually behaves today, but the
          final privacy policy requires attorney review before launch. Wording
          may change materially until then.
        </p>
      </Panel>

      <Panel className="mt-6 p-5">
        <Section title="What we collect">
          <p>
            <strong className="text-foreground">Followers:</strong> your email address, optional first
            name, and the options you pick (email updates, trade interest,
            public wall display name and general location).
          </p>
          <p>
            <strong className="text-foreground">Trade offers:</strong> your name, email, optional phone
            number, item details, approximate value, location fields, optional
            item photos, and anything you write in the description fields.
          </p>
          <p>
            <strong className="text-foreground">Everything else:</strong> lightweight, privacy-light
            analytics — page views and clicks with pathname and campaign tags.
            No cookies, no advertising identifiers.
          </p>
        </Section>

        <Section title="What we publish">
          <p>
            Only what you explicitly opt into: a display name and general
            location on the public follower wall (only while you keep ongoing
            email updates active), and completed-trade details that the site
            operator records and publishes.
          </p>
          <p>
            We do <strong className="text-foreground">not</strong> publish email addresses, phone
            numbers, offer descriptions, photos from unselected offers, or any
            private offer data.
          </p>
        </Section>

        <Section title="Emails and unsubscribing">
          <p>
            Trade-update emails go only to followers who opted in to ongoing
            updates. Every email includes a personal unsubscribe link; using it
            stops future emails and removes you from the public follower wall
            immediately. Unsubscribing does not delete historical records.
          </p>
        </Section>

        <Section title="How data is stored">
          <p>
            Data lives in a Supabase (Postgres) database with row-level
            security, in a project controlled by the site operator. Offer
            photos are stored in a private bucket; they are only visible to the
            site operator through short-lived signed links.
          </p>
        </Section>

        <Section title="What we do not do">
          <p>
            We do not sell, rent, or share your personal data with third
            parties. We do not use advertising trackers. Nothing on this site
            is a guarantee of valuation, acceptance, safety, tax treatment, or
            legal ownership.
          </p>
        </Section>

        <Section title="Your choices">
          <p>
            You can unsubscribe at any time using the link in any email. To
            review, correct, or delete personal data, contact the site
            operator through the channels listed on the challenge page.
            Deletion requests are handled manually by the operator.
          </p>
        </Section>

        <Section title="Changes">
          <p>
            This policy may be updated as the challenge develops and as final
            legal copy lands. The version in effect is the one published here.
          </p>
        </Section>
      </Panel>

      <p className="mt-6 text-xs text-faded">
        Questions about your data? Contact the site operator through the
        channels listed on the challenge page.
      </p>
    </main>
  );
}
