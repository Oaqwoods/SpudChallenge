export interface DurationParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function splitDuration(ms: number): DurationParts {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

export const padTwo = (n: number): string => String(n).padStart(2, "0");

export function compactDuration(ms: number): string {
  const d = splitDuration(ms);
  return `${d.days}d ${padTwo(d.hours)}h ${padTwo(d.minutes)}m`;
}

// Displayed in the viewer's local timezone; the underlying timestamps are
// timezone-safe (epoch diffs), this is presentation only.
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}
