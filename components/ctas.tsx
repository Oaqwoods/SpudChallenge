"use client";

import { useChallenge } from "@/components/challenge-provider";
import { useNow } from "@/hooks/use-now";
import { track } from "@/lib/analytics";
import { getPhase } from "@/lib/challenge";

// retro-shadow + active press gives the buttons a tactile console feel.
const baseButton =
  "retro-shadow inline-flex items-center justify-center border-[3px] px-5 py-4 font-display text-[10px] uppercase tracking-wider transition-all active:translate-x-[3px] active:translate-y-[3px] active:shadow-none sm:text-xs";

const primary = "border-accent bg-accent text-black hover:bg-transparent hover:text-accent";
const secondary = "border-accent text-accent hover:bg-accent hover:text-black";

export function OfferCta() {
  const { settings } = useChallenge();
  const now = useNow(30000);
  const phase = now !== null ? getPhase(settings, now) : "prelaunch";
  const paused = settings?.offers_paused ?? false;

  if (phase === "complete") {
    return (
      <span
        aria-disabled="true"
        className={`${baseButton} cursor-not-allowed border-edge bg-panel text-faded`}
      >
        Offers Closed
      </span>
    );
  }
  if (paused) {
    return (
      <span
        aria-disabled="true"
        className={`${baseButton} cursor-not-allowed border-edge bg-panel text-faded`}
      >
        Offers Paused
      </span>
    );
  }

  // Prompt 39: prelaunch submissions are collected for Trade #1, so the CTA
  // is live in both phases. Follow stays visually primary before launch
  // (spec §17); the offer CTA leads once the challenge is active.
  return (
    <a
      href="/offer/"
      onClick={() => track("offer_cta_clicked")}
      className={`${baseButton} ${phase === "active" ? primary : secondary}`}
    >
      I Have Something Better
    </a>
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
