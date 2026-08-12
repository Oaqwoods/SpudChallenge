"use client";

import { useEffect, useState } from "react";

// Hydration-safe ticking clock: null during SSR and first paint, then the
// current epoch millis refreshed every intervalMs.
export function useNow(intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      timer = setTimeout(tick, intervalMs);
    };
    timer = setTimeout(tick, 0);
    return () => clearTimeout(timer);
  }, [intervalMs]);

  return now;
}
