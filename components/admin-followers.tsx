"use client";

// Admin follower management (playbook PROMPT 23): group filters and counts
// (ongoing / trade-interest / both) and wall moderation (hide/show entries).
// Reads the private followers table — admin-gated RLS is the real
// authorization; emails appear here but never on public pages.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Panel } from "@/components/ui";
import { getSupabase } from "@/lib/supabase";
import { formatDateTime } from "@/lib/time";
import {
  countGroups,
  filterFollowers,
  FOLLOWER_GROUPS,
  FOLLOWER_GROUP_LABELS,
  isOnWall,
  toAdminFollower,
  wallStatus,
  type AdminFollowerRow,
  type FollowerGroup,
} from "@/lib/admin-followers";

const FOLLOWER_COLUMNS = [
  "id",
  "email",
  "first_name",
  "email_updates_opt_in",
  "email_updates_unsubscribed_at",
  "trade_interest",
  "public_wall_opt_in",
  "public_display_name",
  "public_general_location",
  "public_visible",
  "created_at",
].join(", ");

const inputClass =
  "w-full border-[3px] border-edge bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent";
const labelClass = "font-display text-[8px] uppercase text-faded sm:text-[9px]";
const actionButtonClass =
  "border-2 border-edge px-2 py-1 font-display text-[7px] uppercase tracking-wider text-faded transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50 sm:text-[8px]";

type LoadState =
  | { phase: "loading" }
  | { phase: "unconfigured" }
  | { phase: "error"; message: string }
  | { phase: "ready"; followers: AdminFollowerRow[] };

// Fetch-only (no setState): the caller awaits this and applies the result.
async function fetchFollowers(): Promise<LoadState> {
  const supabase = getSupabase();
  if (!supabase) return { phase: "unconfigured" };
  const { data, error } = await supabase
    .from("followers")
    .select(FOLLOWER_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    return {
      phase: "error",
      message: `Could not load followers (${error.message}). Check your session and try again.`,
    };
  }
  const raw = (data ?? []) as unknown as Record<string, unknown>[];
  const followers = raw
    .map(toAdminFollower)
    .filter((f): f is AdminFollowerRow => f !== null);
  return { phase: "ready", followers };
}

export function AdminFollowers() {
  const [state, setState] = useState<LoadState>({ phase: "loading" });
  const [group, setGroup] = useState<FollowerGroup>("all");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    setState({ phase: "loading" });
    const next = await fetchFollowers();
    setState(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const initialLoad = async () => {
      const next = await fetchFollowers();
      if (!cancelled) setState(next);
    };
    void initialLoad();
    return () => {
      cancelled = true;
    };
  }, []);

  const setWallVisibility = async (follower: AdminFollowerRow, visible: boolean) => {
    if (state.phase !== "ready") return;
    const supabase = getSupabase();
    if (!supabase) return;
    setPendingId(follower.id);
    setNotice(null);
    const { error } = await supabase
      .from("followers")
      .update({ public_visible: visible })
      .eq("id", follower.id);
    setPendingId(null);
    if (error) {
      setNotice({ tone: "error", text: `Could not update “${follower.email}” — ${error.message}` });
      return;
    }
    setNotice({
      tone: "ok",
      text: visible
        ? "Entry is visible on the public wall again (if the person is still opted in)."
        : "Entry is hidden from the public wall.",
    });
    setState((prev) =>
      prev.phase === "ready"
        ? {
            ...prev,
            followers: prev.followers.map((f) =>
              f.id === follower.id ? { ...f, public_visible: visible } : f,
            ),
          }
        : prev,
    );
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
          <p className="font-display text-xs text-accent">FOLLOWERS UNAVAILABLE</p>
          <p className="mt-4 text-sm leading-relaxed text-faded">
            {state.phase === "unconfigured"
              ? "Admin is not configured yet (missing Supabase configuration)."
              : state.message}
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="mt-6 border-[3px] border-accent bg-accent px-4 py-2 font-display text-[9px] uppercase tracking-wider text-black transition-colors hover:bg-transparent hover:text-accent sm:text-[10px]"
          >
            Try again
          </button>
        </Panel>
      </main>
    );
  }

  const { followers } = state;
  const counts = countGroups(followers);
  const visible = filterFollowers(followers, group);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-base text-accent sm:text-lg">FOLLOWERS</h1>
        <div className="flex items-center gap-3">
          <Link href="/admin/" className="text-xs text-faded underline hover:text-accent">
            Back to dashboard
          </Link>
          <button
            type="button"
            onClick={() => void refresh()}
            className="text-xs text-faded underline hover:text-accent"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {FOLLOWER_GROUPS.map((g) => (
          <Panel key={g} className="px-3 py-4 text-center">
            <div className="font-display text-xl text-accent sm:text-2xl">{counts[g]}</div>
            <div className="mt-2 font-display text-[8px] uppercase text-faded">
              {FOLLOWER_GROUP_LABELS[g]}
            </div>
          </Panel>
        ))}
      </div>

      <section aria-label="Follower list" className="mt-8">
        <div className="grid gap-3 sm:max-w-xs">
          <div className="flex flex-col gap-1">
            <label htmlFor="follower-group-filter" className={labelClass}>
              Group
            </label>
            <select
              id="follower-group-filter"
              className={inputClass}
              value={group}
              onChange={(e) => setGroup(e.target.value as FollowerGroup)}
            >
              {FOLLOWER_GROUPS.map((g) => (
                <option key={g} value={g}>
                  {FOLLOWER_GROUP_LABELS[g]} ({counts[g]})
                </option>
              ))}
            </select>
          </div>
        </div>

        {notice ? (
          <p
            role={notice.tone === "error" ? "alert" : "status"}
            className={`mt-4 border-[3px] px-3 py-2 text-sm ${
              notice.tone === "error" ? "border-alert text-alert" : "border-mint text-mint"
            }`}
          >
            {notice.text}
          </p>
        ) : null}

        {followers.length === 0 ? (
          <Panel className="mt-4 p-8 text-center">
            <p className="text-sm text-faded">No signups yet.</p>
          </Panel>
        ) : visible.length === 0 ? (
          <Panel className="mt-4 p-8 text-center">
            <p className="text-sm text-faded">No followers in this group.</p>
          </Panel>
        ) : (
          <Panel className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b-[3px] border-edge font-display text-[8px] uppercase text-faded">
                  <th className="px-3 py-2">Person</th>
                  <th className="px-3 py-2">Groups</th>
                  <th className="px-3 py-2">Wall</th>
                  <th className="px-3 py-2">Joined</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((f) => (
                  <FollowerRow
                    key={f.id}
                    follower={f}
                    busy={pendingId === f.id}
                    onVisibility={(v) => void setWallVisibility(f, v)}
                  />
                ))}
              </tbody>
            </table>
          </Panel>
        )}

        <p className="mt-3 text-xs leading-relaxed text-faded">
          Emails are shown here for identification only — the public wall
          displays opted-in display names, never emails. Hiding an entry
          removes it from the wall immediately; unsubscribing from ongoing
          emails removes a person from the wall automatically.
        </p>
      </section>
    </main>
  );
}

function FollowerRow({
  follower: f,
  busy,
  onVisibility,
}: {
  follower: AdminFollowerRow;
  busy: boolean;
  onVisibility: (visible: boolean) => void;
}) {
  const onWall = isOnWall(f);
  const badges = [
    f.email_updates_opt_in && f.email_updates_unsubscribed_at === null ? "ongoing" : null,
    f.trade_interest ? "trade lead" : null,
  ].filter((b): b is string => b !== null);

  return (
    <tr className="border-b border-edge/60 align-top">
      <td className="px-3 py-3">
        <p className="text-foreground">{f.email}</p>
        {f.first_name ? <p className="mt-1 text-xs text-faded">{f.first_name}</p> : null}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-1">
          {badges.length === 0 ? (
            <span className="border border-faded px-2 py-0.5 font-display text-[7px] uppercase text-faded">
              inactive
            </span>
          ) : (
            badges.map((b) => (
              <span
                key={b}
                className="border border-mint px-2 py-0.5 font-display text-[7px] uppercase text-mint"
              >
                {b}
              </span>
            ))
          )}
        </div>
      </td>
      <td className="px-3 py-3">
        <p className="text-xs text-foreground">{wallStatus(f)}</p>
        {f.public_display_name ? (
          <p className="mt-1 text-xs text-faded">“{f.public_display_name}”</p>
        ) : null}
      </td>
      <td className="px-3 py-3 text-xs text-faded">
        {f.created_at ? formatDateTime(f.created_at) : "—"}
      </td>
      <td className="px-3 py-3">
        {f.public_wall_opt_in && f.public_display_name ? (
          <button
            type="button"
            className={actionButtonClass}
            disabled={busy}
            onClick={() => onVisibility(!f.public_visible)}
          >
            {busy ? "…" : onWall ? "Hide from wall" : "Show on wall"}
          </button>
        ) : (
          <span className="text-xs text-faded">—</span>
        )}
      </td>
    </tr>
  );
}
