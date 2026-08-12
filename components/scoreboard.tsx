"use client";

import { useChallenge } from "@/components/challenge-provider";
import { useNow } from "@/hooks/use-now";
import { DEFAULT_SETTINGS, getPhase } from "@/lib/challenge";
import { formatMultiplier, formatUsd } from "@/lib/format";
import { Panel, SectionHeading } from "@/components/ui";

const pad = (n: number) => String(n).padStart(2, "0");

function compactRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${days}d ${pad(hours)}h ${pad(minutes)}m`;
}

export function ScoreboardSection() {
  const { settings, trades, loading } = useChallenge();
  const now = useNow(1000);
  const s = settings ?? DEFAULT_SETTINGS;

  let remaining = "TBA";
  if (!loading && now !== null) {
    const phase = getPhase(settings, now);
    if (phase === "complete") {
      remaining = "COMPLETE";
    } else if (phase === "active" && s.end_at) {
      remaining = compactRemaining(Date.parse(s.end_at) - now);
    }
  }

  const stats: Array<[string, string]> = [
    ["Starting Value", formatUsd(s.starting_value)],
    ["Current Value", formatUsd(s.current_item_value)],
    ["Multiplier", formatMultiplier(s.current_item_value, s.starting_value)],
    ["Completed Trades", String(trades.length)],
    ["Time Remaining", remaining],
    ["Goal", formatUsd(s.target_value)],
  ];

  return (
    <section aria-label="Scoreboard" className="mx-auto max-w-3xl px-4 py-8">
      <SectionHeading>Scoreboard</SectionHeading>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <Panel key={label} className="px-3 py-4 text-center">
            <p className="font-display text-[8px] uppercase text-faded sm:text-[9px]">{label}</p>
            <p
              className={`mt-2 font-display text-xs sm:text-sm ${
                label === "Current Value" ? "text-accent" : "text-mint"
              }`}
            >
              {value}
            </p>
          </Panel>
        ))}
      </div>
    </section>
  );
}
