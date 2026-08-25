"use client";

import { useChallenge } from "@/components/challenge-provider";
import { useNow } from "@/hooks/use-now";
import { DEFAULT_SETTINGS, getPhase } from "@/lib/challenge";
import { splitDuration, padTwo, formatDateTime } from "@/lib/time";
import { formatMultiplier, formatUsd } from "@/lib/format";
import { Panel, SectionHeading } from "@/components/ui";

function Unit({ value, label }: { value: string; label: string }) {
  return (
    <Panel className="px-2 py-4 text-center sm:py-5">
      <div className="font-display text-xl text-accent sm:text-3xl">{value}</div>
      <div className="mt-2 font-display text-[8px] uppercase text-faded sm:text-[9px]">
        {label}
      </div>
    </Panel>
  );
}

function CompleteResult() {
  const { settings, trades } = useChallenge();
  const s = settings ?? DEFAULT_SETTINGS;
  const goalReached = s.current_item_value >= s.target_value;

  return (
    <Panel className="p-6 text-center">
      <p className="font-display text-sm text-mint sm:text-lg">CHALLENGE COMPLETE</p>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <p className="font-display text-[8px] uppercase text-faded">Final Value</p>
          <p className="mt-2 font-display text-base text-accent sm:text-lg">
            {formatUsd(s.current_item_value)}
          </p>
        </div>
        <div>
          <p className="font-display text-[8px] uppercase text-faded">Multiplier</p>
          <p className="mt-2 font-display text-base text-mint sm:text-lg">
            {formatMultiplier(s.current_item_value, s.starting_value)}
          </p>
        </div>
        <div>
          <p className="font-display text-[8px] uppercase text-faded">Trades</p>
          <p className="mt-2 font-display text-base text-mint sm:text-lg">{trades.length}</p>
        </div>
      </div>
      <p
        className={`mt-6 font-display text-[10px] sm:text-xs ${
          goalReached ? "text-mint" : "text-alert"
        }`}
      >
        {goalReached
          ? `★ ${formatUsd(s.target_value)} GOAL REACHED`
          : `GOAL NOT REACHED — FINISHED AT ${formatUsd(s.current_item_value)}`}
      </p>
    </Panel>
  );
}

export function CountdownSection() {
  const { settings, loading } = useChallenge();
  const now = useNow(1000);
  const s = settings ?? DEFAULT_SETTINGS;

  let label = "Challenge Starts In";
  let target: number | null = null;
  let complete = false;

  if (now !== null) {
    const phase = getPhase(settings, now);
    if (phase === "complete") {
      complete = true;
    } else if (phase === "active") {
      label = "Time Remaining";
      target = s.end_at ? Date.parse(s.end_at) : null;
    } else {
      target = s.start_at ? Date.parse(s.start_at) : null;
    }
  }

  const showSkeleton = loading || now === null;
  const targetMs = target !== null && !Number.isNaN(target) ? target : null;

  return (
    <section aria-label="Challenge countdown" className="mx-auto max-w-3xl px-4 py-8">
      <SectionHeading>{label}</SectionHeading>
      <div className="mt-4">
        {showSkeleton ? (
          <div className="grid grid-cols-4 gap-2 sm:gap-3" aria-hidden="true">
            {["--", "--", "--", "--"].map((v, i) => (
              <Unit key={i} value={v} label={["Days", "Hours", "Min", "Sec"][i]} />
            ))}
          </div>
        ) : complete ? (
          <CompleteResult />
        ) : targetMs === null ? (
          <Panel className="px-4 py-8 text-center">
            <p className="font-display text-xs text-faded sm:text-sm">START DATE TBA</p>
          </Panel>
        ) : (
          <div>
            {(() => {
              const d = splitDuration(targetMs - now);
              const summary = `${d.days} days, ${d.hours} hours, ${d.minutes} minutes, ${d.seconds} seconds`;
              return (
                <div role="timer" aria-live="off">
                  <span className="sr-only">
                    {label}: {summary}
                  </span>
                  <div className="grid grid-cols-4 gap-2 sm:gap-3" aria-hidden="true">
                    <Unit value={String(d.days)} label="Days" />
                    <Unit value={padTwo(d.hours)} label="Hours" />
                    <Unit value={padTwo(d.minutes)} label="Min" />
                    <Unit value={padTwo(d.seconds)} label="Sec" />
                  </div>
                </div>
              );
            })()}
            {label === "Challenge Starts In" && s.start_at ? (
              <p className="mt-3 text-center text-xs text-faded">
                Starts {formatDateTime(s.start_at)}
              </p>
            ) : null}
            {label === "Time Remaining" && s.end_at ? (
              <p className="mt-3 text-center text-xs text-faded">
                Challenge ends {formatDateTime(s.end_at)}
              </p>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
