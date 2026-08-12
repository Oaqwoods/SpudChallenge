"use client";

import { useChallenge } from "@/components/challenge-provider";
import { useNow } from "@/hooks/use-now";
import { DEFAULT_SETTINGS, getPhase } from "@/lib/challenge";
import { Panel, SectionHeading } from "@/components/ui";

function splitDuration(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

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
          <Panel className="px-4 py-8 text-center">
            <p className="font-display text-sm text-mint sm:text-lg">CHALLENGE COMPLETE</p>
          </Panel>
        ) : target === null || Number.isNaN(target) ? (
          <Panel className="px-4 py-8 text-center">
            <p className="font-display text-xs text-faded sm:text-sm">START DATE TBA</p>
          </Panel>
        ) : (
          (() => {
            const d = splitDuration(target - now);
            const summary = `${d.days} days, ${d.hours} hours, ${d.minutes} minutes, ${d.seconds} seconds`;
            return (
              <div role="timer" aria-live="off">
                <span className="sr-only">
                  {label}: {summary}
                </span>
                <div className="grid grid-cols-4 gap-2 sm:gap-3" aria-hidden="true">
                  <Unit value={String(d.days)} label="Days" />
                  <Unit value={pad(d.hours)} label="Hours" />
                  <Unit value={pad(d.minutes)} label="Min" />
                  <Unit value={pad(d.seconds)} label="Sec" />
                </div>
              </div>
            );
          })()
        )}
      </div>
    </section>
  );
}
