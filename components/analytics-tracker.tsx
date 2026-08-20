"use client";

// Mount-time analytics beacons. Static hosting means one full page load per
// route, so a mount is a view. Rendering nothing keeps these invisible to
// the layout.

import { useEffect } from "react";
import { track, type AnalyticsEvent } from "@/lib/analytics";

export function TrackOnMount({ event, detail }: { event: AnalyticsEvent; detail?: string }) {
  useEffect(() => {
    let cancelled = false;
    const fire = async () => {
      await Promise.resolve();
      if (!cancelled) track(event, detail);
    };
    void fire();
    return () => {
      cancelled = true;
    };
  }, [event, detail]);
  return null;
}

export function PageViewTracker() {
  return <TrackOnMount event="page_view" />;
}
