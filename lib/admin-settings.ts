// Admin launch controls helpers (spec §6.5). Pure functions only so the
// start-window and validation rules stay unit-testable; the component in
// components/admin-settings.tsx applies them against challenge_settings
// (admin-gated RLS policies are the real authorization).

import { num, str, type ChallengeSettings } from "./challenge.ts";

export const CHALLENGE_DURATION_MS = 21 * 24 * 60 * 60 * 1000;

export type ChallengeStatus = ChallengeSettings["status"];

export interface SettingsDraft {
  title: string;
  subtitle: string;
  starting_value: string;
  target_value: string;
  start_local: string;
  end_local: string;
  status: ChallengeStatus;
  current_item_name: string;
  current_item_description: string;
  current_item_value: string;
  current_item_general_location: string;
}

export function draftFromSettings(s: ChallengeSettings): SettingsDraft {
  return {
    title: s.title,
    subtitle: s.subtitle,
    starting_value: String(s.starting_value),
    target_value: String(s.target_value),
    start_local: isoToDatetimeLocal(s.start_at),
    end_local: isoToDatetimeLocal(s.end_at),
    status: s.status,
    current_item_name: s.current_item_name,
    current_item_description: s.current_item_description ?? "",
    current_item_value: String(s.current_item_value),
    current_item_general_location: s.current_item_general_location ?? "",
  };
}

// The one-click launch is only offered before the challenge has ever
// started; this is the double-start guard (spec §6.5).
export function canStartChallenge(s: ChallengeSettings): boolean {
  return s.status === "prelaunch" && s.start_at === null;
}

// start now, end 21 days later — both as UTC ISO strings.
export function computeLaunchWindow(nowMs: number): { start_at: string; end_at: string } {
  return {
    start_at: new Date(nowMs).toISOString(),
    end_at: new Date(nowMs + CHALLENGE_DURATION_MS).toISOString(),
  };
}

export function isoToDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// datetime-local values are wall-clock in the browser's timezone; store UTC.
export function datetimeLocalToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// Mirrors the DB constraints (challenge_settings_time_order, non-negative
// values, positive target) so a bad save fails with a clear message instead
// of an opaque Postgres error.
export function validateSettingsDraft(draft: SettingsDraft): string | null {
  if (draft.title.trim() === "") return "The challenge title is required.";
  if (draft.current_item_name.trim() === "") return "The current item name is required.";
  const starting = Number(draft.starting_value);
  if (!Number.isFinite(starting) || starting < 0) {
    return "Starting value must be a number of $0 or more.";
  }
  const target = Number(draft.target_value);
  if (!Number.isFinite(target) || target <= 0) {
    return "Target value must be a number above $0.";
  }
  const current = Number(draft.current_item_value);
  if (!Number.isFinite(current) || current < 0) {
    return "Current item value must be a number of $0 or more.";
  }
  const start = datetimeLocalToIso(draft.start_local);
  const end = datetimeLocalToIso(draft.end_local);
  if (draft.start_local && start === null) return "The start date could not be read.";
  if (draft.end_local && end === null) return "The end date could not be read.";
  if (start !== null && end !== null && Date.parse(end) <= Date.parse(start)) {
    return "The end date must be after the start date.";
  }
  return null;
}

export function buildSettingsUpdate(draft: SettingsDraft): Record<string, unknown> {
  return {
    title: draft.title.trim(),
    subtitle: draft.subtitle.trim(),
    starting_value: num(draft.starting_value),
    target_value: num(draft.target_value),
    start_at: datetimeLocalToIso(draft.start_local),
    end_at: datetimeLocalToIso(draft.end_local),
    status: draft.status,
    current_item_name: draft.current_item_name.trim(),
    current_item_description: str(draft.current_item_description.trim()),
    current_item_value: num(draft.current_item_value),
    current_item_general_location: str(draft.current_item_general_location.trim()),
  };
}

// Pause / resume + public notice (playbook PROMPT 30). Deliberately a
// SEPARATE update from buildSettingsUpdate: pausing must never touch the
// schedule fields ("pausing does not alter the challenge clock"), and a
// normal settings save must never unpause anything by accident.

export const PUBLIC_NOTICE_MAX = 500;

export interface PauseDraft {
  offers_paused: boolean;
  follower_signups_paused: boolean;
  public_notice: string;
}

export function pauseDraftFromSettings(s: ChallengeSettings): PauseDraft {
  return {
    offers_paused: s.offers_paused,
    follower_signups_paused: s.follower_signups_paused,
    public_notice: s.public_notice ?? "",
  };
}

export function buildPauseUpdate(draft: PauseDraft): Record<string, unknown> {
  return {
    offers_paused: draft.offers_paused,
    follower_signups_paused: draft.follower_signups_paused,
    public_notice: str(draft.public_notice.trim().slice(0, PUBLIC_NOTICE_MAX)),
  };
}
