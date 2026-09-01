"use client";

// Meta advertising-measurement consent + Pixel loader (playbook PROMPT 40 /
// build spec §39). Meta measurement is OFF until the visitor explicitly
// allows it; the choice lives only in their browser. First-party analytics
// (lib/analytics.ts) run regardless. The banner is informational, never
// blocking, and Allow/Decline carry equal weight.

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import {
  injectMetaPixel,
  META_CONSENT_CHANGED_EVENT,
  META_CONSENT_REOPEN_EVENT,
  metaConsentBannerVisible,
  metaMeasurementAllowed,
  metaPixelConfigured,
  requestMetaConsentChoiceChange,
  trackMetaPageView,
  writeMetaConsent,
} from "@/lib/meta";

// The consent store changes only through writeMetaConsent /
// requestMetaConsentChoiceChange, both of which dispatch these events.
function subscribeToConsent(callback: () => void): () => void {
  window.addEventListener(META_CONSENT_CHANGED_EVENT, callback);
  window.addEventListener(META_CONSENT_REOPEN_EVENT, callback);
  return () => {
    window.removeEventListener(META_CONSENT_CHANGED_EVENT, callback);
    window.removeEventListener(META_CONSENT_REOPEN_EVENT, callback);
  };
}

export function MetaConsentBanner() {
  // Server snapshot is false: the banner only ever appears client-side,
  // after hydration, so static HTML stays consent-neutral.
  const visible = useSyncExternalStore(
    subscribeToConsent,
    () => metaConsentBannerVisible(),
    () => false,
  );

  // No Pixel configured anywhere: the banner has nothing to ask about.
  if (!metaPixelConfigured() || !visible) return null;

  return (
    <div
      role="region"
      aria-label="Meta advertising measurement consent"
      className="fixed inset-x-0 bottom-0 z-50 border-t-[3px] border-edge bg-panel px-4 py-3"
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-xs leading-relaxed text-faded">
          <span className="font-display text-[9px] uppercase text-accent">
            Meta ad measurement
          </span>{" "}
          — may we use Meta (Facebook) Pixel + Conversions API to measure
          advertising? Only successful follower signups and offer submissions
          are reported, as a conversion type — never your email, name, phone,
          offer details, or photos. See the{" "}
          <Link href="/privacy/" className="text-accent underline">
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => writeMetaConsent("declined")}
            className="border-[3px] border-edge px-4 py-2 font-display text-[9px] uppercase tracking-wider text-foreground transition-colors hover:border-accent hover:text-accent"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => writeMetaConsent("allowed")}
            className="border-[3px] border-edge px-4 py-2 font-display text-[9px] uppercase tracking-wider text-foreground transition-colors hover:border-accent hover:text-accent"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}

export function MetaPixelLoader() {
  useEffect(() => {
    const startIfAllowed = () => {
      // Consent first: the Pixel script is only ever injected after an
      // explicit Allow, including a grant made during this session.
      if (!metaMeasurementAllowed()) return;
      if (injectMetaPixel()) trackMetaPageView();
    };
    startIfAllowed();
    window.addEventListener(META_CONSENT_CHANGED_EVENT, startIfAllowed);
    return () => {
      window.removeEventListener(META_CONSENT_CHANGED_EVENT, startIfAllowed);
    };
  }, []);
  return null;
}

// Footer control for revisiting the choice at any time. Renders nothing
// when no Pixel is configured anywhere.
export function MetaConsentSettingsLink() {
  if (!metaPixelConfigured()) return null;
  return (
    <button
      type="button"
      onClick={() => requestMetaConsentChoiceChange()}
      className="text-faded underline hover:text-accent"
    >
      Meta Ad Measurement Settings
    </button>
  );
}
