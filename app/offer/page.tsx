import type { Metadata } from "next";
import Link from "next/link";
import { ChallengeProvider } from "@/components/challenge-provider";
import { Header } from "@/components/header";
import { OfferForm } from "@/components/offer-form";

export const metadata: Metadata = {
  title: "I Have Something Better",
  description:
    "Offer a trade for the current ONE → FIVE challenge item. Submission is not acceptance.",
  alternates: { canonical: "/offer/" },
};

export default function OfferPage() {
  return (
    <div id="top">
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Link href="/" className="text-sm text-faded hover:text-accent">
          ← Back to the challenge
        </Link>
        <h1 className="mt-4 font-display text-base text-accent sm:text-lg">
          I HAVE SOMETHING BETTER
        </h1>
        <div className="mt-6">
          <ChallengeProvider>
            <OfferForm />
          </ChallengeProvider>
        </div>
      </main>
    </div>
  );
}
