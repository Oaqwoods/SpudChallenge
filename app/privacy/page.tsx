import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/ui";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Privacy policy for the ONE → FIVE 21-day trade challenge.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/" className="text-sm text-faded hover:text-accent">
        ← Back to the challenge
      </Link>
      <h1 className="mt-6 font-display text-base text-accent sm:text-lg">PRIVACY POLICY</h1>
      <Panel className="mt-6 p-5">
        <p className="text-sm leading-relaxed text-faded">
          Placeholder. The final privacy policy requires attorney review before
          launch. We do not publish email addresses, phone numbers, or private
          offer data; public follower display is opt-in only.
        </p>
      </Panel>
    </main>
  );
}
