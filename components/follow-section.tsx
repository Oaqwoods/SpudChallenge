"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useChallenge } from "@/components/challenge-provider";
import { track } from "@/lib/analytics";
import { buildMetaRequestMetadata, fireMetaLead } from "@/lib/meta";
import { callEdgeFunction } from "@/lib/supabase";
import { readUtm } from "@/lib/utm";
import { Panel, SectionHeading } from "@/components/ui";

interface SignupResponse {
  ok: boolean;
  email_updates_opt_in: boolean;
  trade_interest: boolean;
  email_sent: boolean;
}

// text-base on phones: iOS Safari zooms the page when focusing inputs
// smaller than 16px.
const inputClass =
  "w-full border-[3px] border-edge bg-background px-3 py-3 text-base text-foreground outline-none focus:border-accent sm:py-2 sm:text-sm";
const labelClass = "font-display text-[8px] uppercase text-faded sm:text-[9px]";

function FollowForm() {
  const { settings } = useChallenge();
  const paused = settings?.follower_signups_paused ?? false;

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [emailUpdates, setEmailUpdates] = useState(false);
  const [tradeInterest, setTradeInterest] = useState(false);
  const [wallOptIn, setWallOptIn] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [emailSent, setEmailSent] = useState(false);

  if (paused) {
    return (
      <Panel className="p-6 text-center">
        <p className="font-display text-xs text-accent">SIGNUPS PAUSED</p>
        <p className="mt-3 text-sm text-faded">
          Follower signups are briefly paused. Please check back soon.
        </p>
      </Panel>
    );
  }

  if (status === "success") {
    return (
      <Panel className="p-6 text-center" role="status">
        <p className="font-display text-xs text-mint">YOU&apos;RE ON THE LIST</p>
        <p className="mt-3 text-sm leading-relaxed text-foreground">{message}</p>
        {emailSent ? (
          <p className="mt-3 text-xs text-faded">Check your inbox for a confirmation email.</p>
        ) : null}
        <p className="mt-3 text-xs text-faded">
          To add an option later, submit again with the same email. To stop
          trade emails, use the unsubscribe link in any update.
        </p>
      </Panel>
    );
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (status === "submitting") return;
    setMessage("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setStatus("error");
      setMessage("Please enter a valid email address.");
      return;
    }
    if (!emailUpdates && !tradeInterest) {
      setStatus("error");
      setMessage("Choose at least one option to continue.");
      return;
    }
    if (wallOptIn && !displayName.trim() && !firstName.trim()) {
      setStatus("error");
      setMessage("Add a name to appear on the follower wall.");
      return;
    }

    setStatus("submitting");
    try {
      // Optional, consent-gated Meta measurement metadata (prompt 40). The
      // same event_id is reused by the browser Pixel Lead AFTER the backend
      // confirms success, so Meta can deduplicate Pixel + Conversions API.
      const meta = buildMetaRequestMetadata();
      const res = await callEdgeFunction<SignupResponse>("follow-signup", {
        email: normalizedEmail,
        first_name: firstName.trim() || null,
        email_updates_opt_in: emailUpdates,
        trade_interest: tradeInterest,
        public_wall_opt_in: wallOptIn,
        public_display_name: displayName.trim() || null,
        website,
        ...(meta ? { meta } : {}),
        ...readUtm(),
      });
      setStatus("success");
      setEmailSent(res.email_sent);
      track("follower_submitted");
      if (meta) fireMetaLead("follower", meta.event_id);
      if (res.trade_interest) track("potential_trader_captured");
      if (res.email_updates_opt_in && res.trade_interest) {
        setMessage(
          "You're in — every completed trade will be emailed to you, and we'll reach out when trades open.",
        );
      } else if (res.email_updates_opt_in) {
        setMessage("You're in. Every completed trade will be emailed to you.");
      } else {
        setMessage(
          "Got it. We'll contact you when the challenge/current trade opens — no ongoing emails.",
        );
      }
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Panel className="p-5">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {/* Honeypot — hidden from people, tempting to bots. */}
        <div className="hidden" aria-hidden="true">
          <label>
            Website
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="follow-email" className={labelClass}>
            Email (required)
          </label>
          <input
            id="follow-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="follow-first-name" className={labelClass}>
            First name (optional)
          </label>
          <input
            id="follow-first-name"
            type="text"
            autoComplete="given-name"
            maxLength={100}
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={inputClass}
          />
        </div>

        <fieldset className="flex flex-col gap-2 border-[3px] border-edge p-3">
          <legend className="px-1 font-display text-[8px] uppercase text-faded sm:text-[9px]">
            Choose at least one
          </legend>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={emailUpdates}
              onChange={(e) => setEmailUpdates(e.target.checked)}
              className="mt-1 accent-accent"
            />
            Email me every completed trade
          </label>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={tradeInterest}
              onChange={(e) => setTradeInterest(e.target.checked)}
              className="mt-1 accent-accent"
            />
            I might have something to trade when the challenge starts
          </label>
        </fieldset>

        <div className="flex flex-col gap-2 border-[3px] border-edge p-3">
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={wallOptIn}
              onChange={(e) => {
                setWallOptIn(e.target.checked);
                if (e.target.checked) track("follower_wall_opt_in");
              }}
              className="mt-1 accent-accent"
            />
            Show my name on the public follower wall
          </label>
          {wallOptIn ? (
            <div className="flex flex-col gap-1">
              <label htmlFor="follow-display-name" className={labelClass}>
                Public display name (falls back to first name)
              </label>
              <input
                id="follow-display-name"
                type="text"
                maxLength={100}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={inputClass}
              />
            </div>
          ) : null}
        </div>

        {status === "error" ? (
          <p role="alert" className="border-[3px] border-alert px-3 py-2 text-sm text-alert">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={status === "submitting"}
          className="border-[3px] border-accent bg-accent px-5 py-4 font-display text-[10px] uppercase tracking-wider text-black transition-colors hover:bg-transparent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60 sm:text-xs"
        >
          {status === "submitting" ? "Submitting…" : "Follow Every Trade"}
        </button>

        <p className="text-xs leading-relaxed text-faded">
          We only use your email for the updates you choose. Never sold, never
          published. Unsubscribe anytime. See the{" "}
          <Link href="/privacy/" className="text-accent underline">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </Panel>
  );
}

function FollowerWall() {
  const { followerCount, followerWall, loading } = useChallenge();

  return (
    <Panel className="p-5">
      <h3 className="font-display text-[10px] uppercase text-accent">
        People Following the Challenge
      </h3>
      <p className="mt-4 font-display text-3xl text-mint">
        {loading ? "–" : (followerCount ?? 0)}
      </p>
      <p className="text-xs text-faded">followers on every-trade updates</p>
      <ul className="mt-4 flex max-h-64 flex-col gap-1 overflow-y-auto border-[3px] border-edge bg-background p-3">
        {loading ? (
          <li className="text-xs text-faded">Loading…</li>
        ) : followerWall.length === 0 ? (
          <li className="text-xs text-faded">Be the first to follow.</li>
        ) : (
          followerWall.map((entry, i) => (
            <li key={`${entry.public_display_name}-${i}`} className="text-sm text-foreground">
              {entry.public_display_name}
              {entry.public_general_location ? (
                <span className="text-xs text-faded"> · {entry.public_general_location}</span>
              ) : null}
            </li>
          ))
        )}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-faded">
        Newest first · shown only with explicit opt-in · emails are never displayed.
      </p>
    </Panel>
  );
}

export function FollowSection() {
  return (
    <section id="follow" aria-labelledby="follow-heading" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-8">
      <SectionHeading id="follow-heading">Follow Every Trade</SectionHeading>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <FollowForm />
        <FollowerWall />
      </div>
    </section>
  );
}
