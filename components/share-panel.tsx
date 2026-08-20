"use client";

// Sharing without social accounts (playbook prompt 13 / build spec §4.11):
// copy link, email, the native share sheet where supported, and plain
// intent URLs for X/Facebook/Reddit. No third-party SDKs.

import { useEffect, useMemo, useState } from "react";
import { useChallenge } from "@/components/challenge-provider";
import { useNow } from "@/hooks/use-now";
import { DEFAULT_SETTINGS, getPhase } from "@/lib/challenge";
import { compactDuration } from "@/lib/time";
import {
  buildShareText,
  buildShareTitle,
  emailShareUrl,
  facebookShareUrl,
  redditShareUrl,
  xShareUrl,
  type ShareState,
} from "@/lib/share";

const shareButtonClass =
  "border-2 border-edge px-3 py-2 font-display text-[8px] uppercase tracking-wider text-faded transition-colors hover:border-accent hover:text-accent";
const socialLinkClass = `${shareButtonClass} inline-block no-underline`;

function siteBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (typeof window !== "undefined" ? window.location.origin : "")
  );
}

export function SharePanel() {
  const { settings, loading } = useChallenge();
  const now = useNow(30_000);
  const [supportsNativeShare, setSupportsNativeShare] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    let cancelled = false;
    const detect = async () => {
      await Promise.resolve();
      const supported =
        typeof navigator !== "undefined" && typeof navigator.share === "function";
      if (!cancelled) setSupportsNativeShare(supported);
    };
    void detect();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (copyState === "idle") return;
    const timer = setTimeout(() => setCopyState("idle"), 2500);
    return () => clearTimeout(timer);
  }, [copyState]);

  const shareState = useMemo<ShareState>(() => {
    const s = settings ?? DEFAULT_SETTINGS;
    const phase = now !== null && !loading ? getPhase(settings, now) : "prelaunch";
    let timeRemainingLabel: string | null = null;
    if (phase === "active" && s.end_at && now !== null) {
      timeRemainingLabel = compactDuration(Date.parse(s.end_at) - now);
    }
    return {
      phase,
      currentItemName: s.current_item_name,
      currentValue: s.current_item_value,
      startingValue: s.starting_value,
      targetValue: s.target_value,
      tradeNumber: s.current_trade_number,
      timeRemainingLabel,
    };
  }, [settings, loading, now]);

  const url = siteBaseUrl();
  const title = buildShareTitle(shareState);
  const text = buildShareText(shareState);

  const copyLink = async () => {
    const target = siteBaseUrl();
    try {
      await navigator.clipboard.writeText(target);
      setCopyState("copied");
    } catch {
      // Clipboard API unavailable (older browsers, non-secure contexts):
      // fall back to a hidden textarea copy.
      try {
        const helper = document.createElement("textarea");
        helper.value = target;
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        document.execCommand("copy");
        document.body.removeChild(helper);
        setCopyState("copied");
      } catch {
        setCopyState("failed");
      }
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text, url });
    } catch {
      // Visitor dismissed the share sheet — nothing to report.
    }
  };

  return (
    <div className="border-t-[3px] border-edge px-5 py-4">
      <p className="font-display text-[8px] uppercase text-faded sm:text-[9px]">
        {shareState.phase === "prelaunch" ? "Share the challenge" : "Share this trade"}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => void copyLink()} className={shareButtonClass}>
          {copyState === "copied" ? "Copied!" : "Copy link"}
        </button>
        <a href={emailShareUrl(url, title, text)} className={socialLinkClass}>
          Email
        </a>
        {supportsNativeShare ? (
          <button type="button" onClick={() => void nativeShare()} className={shareButtonClass}>
            Share…
          </button>
        ) : null}
        <a
          href={xShareUrl(url, text)}
          target="_blank"
          rel="noopener noreferrer"
          className={socialLinkClass}
        >
          X
        </a>
        <a
          href={facebookShareUrl(url)}
          target="_blank"
          rel="noopener noreferrer"
          className={socialLinkClass}
        >
          Facebook
        </a>
        <a
          href={redditShareUrl(url, title)}
          target="_blank"
          rel="noopener noreferrer"
          className={socialLinkClass}
        >
          Reddit
        </a>
      </div>
      {copyState === "failed" ? (
        <p role="alert" className="mt-2 text-xs text-alert">
          Copy failed — grab the link from your address bar instead.
        </p>
      ) : null}
    </div>
  );
}
