"use client";

// Launch controls (spec §6.5): schedule the challenge and start it from the
// admin — no code deploy required. Writes go through the browser client;
// real authorization is RLS (admin_update policy gated on is_admin()).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui";
import { getSupabase } from "@/lib/supabase";
import {
  DEFAULT_SETTINGS,
  toSettings,
  getPhase,
  type ChallengeSettings,
} from "@/lib/challenge";
import {
  buildPauseUpdate,
  buildSettingsUpdate,
  canStartChallenge,
  computeLaunchWindow,
  draftFromSettings,
  pauseDraftFromSettings,
  PUBLIC_NOTICE_MAX,
  validateSettingsDraft,
  type PauseDraft,
  type SettingsDraft,
} from "@/lib/admin-settings";
import { formatDateTime } from "@/lib/time";
import { useNow } from "@/hooks/use-now";

const inputClass =
  "w-full border-[3px] border-edge bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent";
const labelClass = "font-display text-[8px] uppercase text-faded sm:text-[9px]";
const saveButtonClass =
  "border-[3px] border-accent bg-accent px-4 py-2 font-display text-[9px] uppercase tracking-wider text-black transition-colors hover:bg-transparent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 sm:text-[10px]";

type LoadState =
  | { phase: "loading" }
  | { phase: "unconfigured" }
  | { phase: "error"; message: string }
  | { phase: "ready"; settings: ChallengeSettings };

// Fetch-only (no setState): the caller awaits this and applies the result.
async function fetchSettings(): Promise<LoadState> {
  const supabase = getSupabase();
  if (!supabase) return { phase: "unconfigured" };
  const { data, error } = await supabase
    .from("challenge_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    return {
      phase: "error",
      message: `Could not load the challenge settings (${error.message}). Check your session and try again.`,
    };
  }
  return {
    phase: "ready",
    settings: data ? toSettings(data as Record<string, unknown>) : DEFAULT_SETTINGS,
  };
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {children}
    </div>
  );
}

export function AdminSettings() {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [pauseDraft, setPauseDraft] = useState<PauseDraft | null>(null);
  const [confirmStart, setConfirmStart] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const now = useNow(30000);

  const refresh = useCallback(async () => {
    const next = await fetchSettings();
    setState(next);
    if (next.phase === "ready") {
      setDraft(draftFromSettings(next.settings));
      setPauseDraft(pauseDraftFromSettings(next.settings));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const initialLoad = async () => {
      const next = await fetchSettings();
      if (cancelled) return;
      setState(next);
      if (next.phase === "ready") {
        setDraft(draftFromSettings(next.settings));
        setPauseDraft(pauseDraftFromSettings(next.settings));
      }
    };
    void initialLoad();
    return () => {
      cancelled = true;
    };
  }, []);

  const set = <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const save = async () => {
    if (state.phase !== "ready" || !draft) return;
    const supabase = getSupabase();
    if (!supabase) return;
    const problem = validateSettingsDraft(draft);
    if (problem) {
      setNotice({ tone: "error", text: problem });
      return;
    }
    setBusy(true);
    setNotice(null);
    const { error } = await supabase
      .from("challenge_settings")
      .update(buildSettingsUpdate(draft))
      .eq("id", 1);
    setBusy(false);
    if (error) {
      setNotice({ tone: "error", text: `Could not save — ${error.message}` });
      return;
    }
    setNotice({ tone: "ok", text: "Challenge settings saved." });
    await refresh();
  };

  // Prompt 32: the whole transition runs server-side (RPC, migration 16) —
  // start_at is the database clock, end_at is exactly start_at + 21 days,
  // and a repeated start is rejected atomically. The browser never supplies
  // timestamps.
  const startNow = async () => {
    if (state.phase !== "ready" || !canStartChallenge(state.settings) || !confirmStart) return;
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    setNotice(null);
    const { error } = await supabase.rpc("start_challenge_now");
    setBusy(false);
    if (error) {
      setNotice({ tone: "error", text: `Could not start the challenge — ${error.message}` });
      return;
    }
    setConfirmStart(false);
    setNotice({
      tone: "ok",
      text: "Challenge started on the server clock. It is now live with a 21-day clock.",
    });
    await refresh();
  };

  // Prompt 30: pause/resume + public notice. Writes ONLY these three
  // columns — the challenge clock is never touched by a pause.
  const savePauses = async () => {
    if (state.phase !== "ready" || !pauseDraft) return;
    const supabase = getSupabase();
    if (!supabase) return;
    setPauseBusy(true);
    setNotice(null);
    const { error } = await supabase
      .from("challenge_settings")
      .update(buildPauseUpdate(pauseDraft))
      .eq("id", 1);
    setPauseBusy(false);
    if (error) {
      setNotice({ tone: "error", text: `Could not save pause settings — ${error.message}` });
      return;
    }
    const pausedAnything = pauseDraft.offers_paused || pauseDraft.follower_signups_paused;
    setNotice({
      tone: "ok",
      text: pausedAnything
        ? "Saved. The selected signups are paused immediately (the clock keeps running)."
        : "Saved. All public signups are open again.",
    });
    await refresh();
  };

  if (state.phase === "loading") {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Panel className="p-8 text-center" aria-hidden="true">
          <p className="font-display text-xs text-faded">LOADING…</p>
        </Panel>
      </main>
    );
  }

  if (state.phase === "unconfigured" || state.phase === "error") {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Panel className="p-8 text-center" role="alert">
          <p className="font-display text-xs text-accent">SETTINGS UNAVAILABLE</p>
          <p className="mt-4 text-sm leading-relaxed text-faded">
            {state.phase === "unconfigured"
              ? "Admin is not configured yet (missing Supabase configuration)."
              : state.message}
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className={`${saveButtonClass} mt-6`}
          >
            Try again
          </button>
        </Panel>
      </main>
    );
  }

  const { settings } = state;
  const phase = now === null ? null : getPhase(settings, now);
  const previewWindow = now === null ? null : computeLaunchWindow(now);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-base text-accent sm:text-lg">LAUNCH CONTROLS</h1>
        <Link href="/admin/" className="text-xs text-faded underline hover:text-accent">
          Back to dashboard
        </Link>
      </div>

      {notice ? (
        <div
          role={notice.tone === "error" ? "alert" : "status"}
          className={`mt-4 border-[3px] px-4 py-3 text-xs ${
            notice.tone === "error" ? "border-alert text-alert" : "border-mint text-mint"
          }`}
        >
          {notice.text}
        </div>
      ) : null}

      <Panel className="mt-6 p-6">
        <p className={labelClass}>Start the challenge</p>
        {canStartChallenge(settings) ? (
          <>
            <p className="mt-3 text-xs leading-relaxed text-faded">
              Starts the challenge immediately using the <strong>server
              clock</strong> (never your browser&apos;s): status becomes
              active, start_at is the database timestamp, and end_at is
              exactly 21 days later. Starting twice is impossible — a repeat
              attempt is rejected.
            </p>
            {previewWindow ? (
              <p className="mt-2 font-display text-[10px] text-foreground sm:text-xs">
                Starts ~{formatDateTime(previewWindow.start_at)} · Ends{" "}
                ~{formatDateTime(previewWindow.end_at)}{" "}
                <span className="text-faded">(estimate — the server stamps the real values)</span>
              </p>
            ) : null}
            <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs text-faded">
              <input
                type="checkbox"
                checked={confirmStart}
                onChange={(e) => setConfirmStart(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
              />
              I understand this makes the challenge public immediately, sets the
              start and end dates, and cannot be repeated once started.
            </label>
            <button
              type="button"
              disabled={busy || !confirmStart}
              onClick={() => void startNow()}
              className={`${saveButtonClass} mt-4`}
            >
              {busy ? "Starting…" : "START CHALLENGE NOW"}
            </button>
          </>
        ) : (
          <p className="mt-3 text-xs leading-relaxed text-faded">
            The challenge has already been started (status: {settings.status}
            {phase ? `, effective phase: ${phase}` : ""}). Use the schedule
            fields below for corrections. The start date
            {settings.start_at ? ` is ${formatDateTime(settings.start_at)}` : " is not set yet"}.
          </p>
        )}
      </Panel>

      <Panel className="mt-4 p-6">
        <p className={labelClass}>Pauses &amp; public notice</p>
        <p className="mt-3 text-xs leading-relaxed text-faded">
          Emergency controls for a live challenge. Pausing closes the public
          form immediately and never alters the challenge clock — time keeps
          running. Uncheck both boxes and save to resume.
        </p>
        {pauseDraft ? (
          <div className="mt-4 flex flex-col gap-4">
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={pauseDraft.offers_paused}
                onChange={(e) =>
                  setPauseDraft({ ...pauseDraft, offers_paused: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
              />
              <span>
                Pause new trade offers
                {pauseDraft.offers_paused ? (
                  <span className="ml-2 border border-alert px-1.5 py-0.5 font-display text-[7px] uppercase text-alert">
                    paused now
                  </span>
                ) : null}
                <span className="mt-1 block text-xs text-faded">
                  The offer form shows a “paused” message; the server rejects
                  new offers and uploads.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={pauseDraft.follower_signups_paused}
                onChange={(e) =>
                  setPauseDraft({ ...pauseDraft, follower_signups_paused: e.target.checked })
                }
                className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
              />
              <span>
                Pause follower signups
                {pauseDraft.follower_signups_paused ? (
                  <span className="ml-2 border border-alert px-1.5 py-0.5 font-display text-[7px] uppercase text-alert">
                    paused now
                  </span>
                ) : null}
                <span className="mt-1 block text-xs text-faded">
                  The follow form shows a “paused” message; the server rejects
                  new signups.
                </span>
              </span>
            </label>
            <Field id="cs-public-notice" label={`Public notice (optional, max ${PUBLIC_NOTICE_MAX} characters — shown in the homepage hero)`}>
              <textarea
                id="cs-public-notice"
                rows={2}
                className={inputClass}
                value={pauseDraft.public_notice}
                maxLength={PUBLIC_NOTICE_MAX}
                placeholder="e.g. Offers are briefly paused for travel — back soon."
                onChange={(e) =>
                  setPauseDraft({ ...pauseDraft, public_notice: e.target.value })
                }
              />
            </Field>
            <div>
              <button
                type="button"
                disabled={pauseBusy}
                onClick={() => void savePauses()}
                className={saveButtonClass}
              >
                {pauseBusy ? "Saving…" : "Save pause settings"}
              </button>
            </div>
          </div>
        ) : null}
      </Panel>

      <form
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Panel className="p-6">
          <p className={labelClass}>Schedule and identity</p>
          {draft ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field id="cs-title" label="Challenge title">
                <input
                  id="cs-title"
                  className={inputClass}
                  value={draft.title}
                  onChange={(e) => set("title", e.target.value)}
                />
              </Field>
              <Field id="cs-subtitle" label="Public premise (subtitle)">
                <input
                  id="cs-subtitle"
                  className={inputClass}
                  value={draft.subtitle}
                  onChange={(e) => set("subtitle", e.target.value)}
                />
              </Field>
              <Field id="cs-start" label="Start date/time (browser timezone)">
                <input
                  id="cs-start"
                  type="datetime-local"
                  className={inputClass}
                  value={draft.start_local}
                  onChange={(e) => set("start_local", e.target.value)}
                />
              </Field>
              <Field id="cs-end" label="End date/time (browser timezone)">
                <input
                  id="cs-end"
                  type="datetime-local"
                  className={inputClass}
                  value={draft.end_local}
                  onChange={(e) => set("end_local", e.target.value)}
                />
              </Field>
              <Field id="cs-target" label="Target value ($)">
                <input
                  id="cs-target"
                  type="number"
                  min="1"
                  className={inputClass}
                  value={draft.target_value}
                  onChange={(e) => set("target_value", e.target.value)}
                />
              </Field>
              <Field id="cs-starting" label="Starting value ($)">
                <input
                  id="cs-starting"
                  type="number"
                  min="0"
                  className={inputClass}
                  value={draft.starting_value}
                  onChange={(e) => set("starting_value", e.target.value)}
                />
              </Field>
              <Field id="cs-status" label="Stored status">
                <select
                  id="cs-status"
                  className={inputClass}
                  value={draft.status}
                  onChange={(e) =>
                    set("status", e.target.value as SettingsDraft["status"])
                  }
                >
                  <option value="prelaunch">prelaunch</option>
                  <option value="active">active</option>
                  <option value="complete">complete</option>
                </select>
              </Field>
            </div>
          ) : null}
        </Panel>

        <Panel className="mt-4 p-6">
          <p className={labelClass}>Current item (shown publicly)</p>
          {draft ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field id="cs-item-name" label="Current item name">
                <input
                  id="cs-item-name"
                  className={inputClass}
                  value={draft.current_item_name}
                  onChange={(e) => set("current_item_name", e.target.value)}
                />
              </Field>
              <Field id="cs-item-value" label="Current item value ($)">
                <input
                  id="cs-item-value"
                  type="number"
                  min="0"
                  className={inputClass}
                  value={draft.current_item_value}
                  onChange={(e) => set("current_item_value", e.target.value)}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field id="cs-item-description" label="Current item description">
                  <textarea
                    id="cs-item-description"
                    rows={3}
                    className={inputClass}
                    value={draft.current_item_description}
                    onChange={(e) => set("current_item_description", e.target.value)}
                  />
                </Field>
              </div>
              <Field id="cs-item-location" label="General location (optional, city-level)">
                <input
                  id="cs-item-location"
                  className={inputClass}
                  value={draft.current_item_general_location}
                  onChange={(e) => set("current_item_general_location", e.target.value)}
                />
              </Field>
            </div>
          ) : null}
        </Panel>

        <div className="mt-4 flex items-center gap-3">
          <button type="submit" disabled={busy || !draft} className={saveButtonClass}>
            {busy ? "Saving…" : "Save settings"}
          </button>
          <p className="text-[11px] text-faded">
            Saving updates the public site immediately. This form never
            touches the pause switches above.
          </p>
        </div>
      </form>
    </main>
  );
}
