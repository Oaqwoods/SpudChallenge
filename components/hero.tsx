"use client";

import { useChallenge } from "@/components/challenge-provider";
import { DEFAULT_SETTINGS, getPhase } from "@/lib/challenge";
import { formatUsd } from "@/lib/format";
import { useNow } from "@/hooks/use-now";
import { OfferCta, FollowCta } from "@/components/ctas";
import { Panel } from "@/components/ui";
import { SpudMascot } from "@/components/spud-mascot";

export function Hero() {
  const { settings } = useChallenge();
  const s = settings ?? DEFAULT_SETTINGS;
  const now = useNow(30000);
  const phase = now === null ? "prelaunch" : getPhase(settings, now);

  return (
    <section className="scanlines border-b-[3px] border-edge">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-5 px-4 pb-10 pt-12 text-center sm:pt-16">
        <SpudMascot className="w-20 sm:w-24" />
        <p className="font-display text-[9px] uppercase tracking-widest text-faded sm:text-[10px]">
          A Trade Challenge by Spud
        </p>
        <p className="font-display text-xs uppercase tracking-widest text-mint sm:text-sm">
          {s.title}
        </p>
        <h1 className="pixel-glow font-display leading-tight text-accent">
          <span className="block text-3xl sm:inline sm:text-4xl">$1 →</span>{" "}
          <span className="mt-2 block text-3xl sm:mt-0 sm:inline sm:text-4xl">
            $5,000,000
          </span>
        </h1>
        <p className="font-display text-[10px] uppercase tracking-widest text-foreground sm:text-xs">
          21 Days. Only Trades.
        </p>
        <p className="font-display text-[8px] uppercase tracking-widest text-mint sm:text-[9px]">
          <span aria-hidden="true" className="blink">▶</span> Status: {phase}
        </p>
        <div className="grid w-full max-w-xs grid-cols-2 gap-3">
          <Panel className="retro-shadow px-3 py-3 text-center">
            <p className="font-display text-[8px] uppercase text-faded">Current Value</p>
            <p className="mt-2 font-display text-lg text-mint">
              {formatUsd(s.current_item_value)}
            </p>
          </Panel>
          <Panel className="retro-shadow px-3 py-3 text-center">
            <p className="font-display text-[8px] uppercase text-faded">Trade #</p>
            <p className="mt-2 font-display text-lg text-accent">{s.current_trade_number}</p>
          </Panel>
        </div>
        <p className="max-w-xl text-sm leading-relaxed text-faded">
          We started with one dollar. We can only trade what we currently have.
          No adding cash to a trade. The clock never resets.
        </p>
        {s.public_notice ? (
          <p className="border-[3px] border-accent bg-panel px-4 py-3 text-sm text-accent">
            {s.public_notice}
          </p>
        ) : null}
        <div className="mt-2 flex flex-col items-stretch gap-3 sm:flex-row">
          <OfferCta />
          <FollowCta />
        </div>
      </div>
    </section>
  );
}
