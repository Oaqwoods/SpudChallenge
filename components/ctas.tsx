"use client";

import { useChallenge } from "@/components/challenge-provider";
import { useNow } from "@/hooks/use-now";
import { track } from "@/lib/analytics";
import { getPhase } from "@/lib/challenge";

const baseButton =
  "inline-flex items-center justify-center border-[3px] px-5 py-4 font-display text-[10px] uppercase tracking-wider transition-colors sm:text-xs";

const primary = "border-accent bg-accent text-black hover:bg-transparent hover:text-accent";
const secondary = "border-accent text-accent hover:bg-accent hover:text-black";

export function OfferCta() {
  const { settings } = useChallenge();
  const now = useNow(30000);
  const phase = now !== null ? getPhase(settings, now) : "prelaunch";
  const paused = settings?.offers_paused ?? false;

  if (phase === "active" && !paused) {
    return (
      <a
        href="/offer/"
        onClick={() => track("offer_cta_clicked")}
        className={`${baseButton} ${primary}`}
      >
        I Have Something Better
      </a>
    );
  }

  const label =
    phase === "complete"
      ? "Offers Closed"
      : paused
        ? "Offers Paused"
        : "Trade #1 Opens at Launch";

  return (
    <span
      aria-disabled="true"
      className={`${baseButton} cursor-not-allowed border-edge bg-panel text-faded`}
    >
      {label}
    </span>
  );
}

export function FollowCta() {
  const { settings } = useChallenge();
  const now = useNow(30000);
  const phase = now !== null ? getPhase(settings, now) : "prelaunch";

  // Prelaunch emphasizes email capture (spec §17); during the active
  // challenge the offer CTA leads and follow becomes secondary.
  const emphasized = phase !== "active";

  return (
    <a
      href="#follow"
      onClick={() => track("follow_cta_clicked")}
      className={`${baseButton} ${emphasized ? primary : secondary}`}
    >
      Follow the Challenge
    </a>
  );
}
