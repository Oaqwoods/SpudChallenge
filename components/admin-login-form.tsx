"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  friendlyAuthMessage,
  friendlyAuthorizationMessage,
  interpretLoginAttempt,
  passwordResetRedirectTo,
} from "@/lib/admin-auth";
import { getSupabase } from "@/lib/supabase";
import { Panel } from "@/components/ui";

const inputClass =
  "w-full border-[3px] border-edge bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent";
const labelClass = "font-display text-[8px] uppercase text-faded sm:text-[9px]";
const linkClass = "text-xs text-faded underline transition-colors hover:text-accent";

type Status = "idle" | "submitting" | "error";
type Mode = "signin" | "reset";
type ResetStatus = "idle" | "sending" | "sent";

export function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<Mode>("signin");
  const [resetStatus, setResetStatus] = useState<ResetStatus>("idle");
  // getSupabase() is a memoized singleton; env vars are inlined at build
  // time, so this is stable across renders and SSR/hydration.
  const configured = getSupabase() !== null;

  // If a previous session is still alive, resolve it before showing the form:
  // admins go straight in, non-admin sessions are cleared.
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    let cancelled = false;
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled || !session) return;
      const probe = await supabase
        .from("app_admins")
        .select("user_id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (cancelled) return;
      const outcome = interpretLoginAttempt(null, { data: probe.data, error: probe.error });
      if (outcome.kind === "admin") {
        window.location.replace("/admin/");
      } else if (outcome.kind === "not_admin") {
        await supabase.auth.signOut();
      }
      // admin_check_failed: leave the session and the form alone; the user
      // can retry and will see the authorization error surfaced explicitly.
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const switchMode = (next: Mode) => {
    setMode(next);
    setStatus("idle");
    setMessage("");
    setResetStatus("idle");
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (status === "submitting" || resetStatus === "sending" || resetStatus === "sent") return;
    setMessage("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || (mode === "signin" && !password)) {
      setStatus("error");
      setMessage(
        mode === "signin"
          ? "Please enter your email and password."
          : "Please enter your email address.",
      );
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setStatus("error");
      setMessage("Admin sign-in is not configured yet.");
      return;
    }

    if (mode === "reset") {
      // Anon-key call; Supabase never reveals whether the address exists and
      // rate-limits requests, so the same confirmation covers both cases.
      // redirectTo must be an allowlisted Redirect URL — the Site URL itself
      // stays at the site root.
      setResetStatus("sending");
      try {
        const redirectTo = passwordResetRedirectTo(
          process.env.NEXT_PUBLIC_SITE_URL,
          window.location.origin,
        );
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo,
        });
        if (error) throw error;
        setResetStatus("sent");
      } catch (err) {
        setResetStatus("idle");
        setStatus("error");
        setMessage(friendlyAuthMessage(err));
      }
      return;
    }

    // Phase 1 — authentication (Supabase Auth). Only failures in this phase
    // are credential errors and reported as such.
    setStatus("submitting");
    let signedInUserId: string;
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) throw error;
      signedInUserId = data.user.id;
    } catch (err) {
      setStatus("error");
      setMessage(friendlyAuthMessage(err));
      setPassword("");
      return;
    }

    // Phase 2 — authorization (app_admins membership). supabase-js stores
    // the session before signInWithPassword resolves, so this query already
    // carries the fresh access token. Any failure here happened AFTER a
    // successful sign-in: the password was correct, so it must never be
    // reported as an incorrect-password error.
    try {
      const probe = await supabase
        .from("app_admins")
        .select("user_id")
        .eq("user_id", signedInUserId)
        .maybeSingle();
      const outcome = interpretLoginAttempt(null, { data: probe.data, error: probe.error });
      if (outcome.kind === "admin") {
        window.location.replace("/admin/");
        return;
      }
      // Signed in but not authorized: no session lingers, and the
      // authorization problem is surfaced with its own wording.
      await supabase.auth.signOut().catch(() => undefined);
      setStatus("error");
      setMessage(outcome.message);
    } catch (err) {
      await supabase.auth.signOut().catch(() => undefined);
      setStatus("error");
      setMessage(friendlyAuthorizationMessage(err));
    }
  };

  if (!configured) {
    return (
      <Panel className="p-8 text-center">
        <p className="text-sm leading-relaxed text-faded">
          Admin sign-in is not configured yet (missing Supabase configuration).
        </p>
      </Panel>
    );
  }

  if (mode === "reset" && resetStatus === "sent") {
    return (
      <Panel className="p-8 text-center" role="status">
        <p className="font-display text-xs text-accent">CHECK YOUR INBOX</p>
        <p className="mt-4 text-sm leading-relaxed text-faded">
          If that address is registered as an admin, a password reset link is
          on its way. Open the link to choose a new password.
        </p>
        <button
          type="button"
          onClick={() => switchMode("signin")}
          className={`${linkClass} mt-6`}
        >
          ← Back to sign in
        </button>
      </Panel>
    );
  }

  const busy = status === "submitting" || resetStatus === "sending";

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {mode === "reset" ? (
        <p className="font-display text-xs text-accent">RESET PASSWORD</p>
      ) : null}
      <div className="flex flex-col gap-1">
        <label htmlFor="admin-email" className={labelClass}>
          Email
        </label>
        <input
          id="admin-email"
          type="email"
          className={inputClass}
          value={email}
          maxLength={254}
          autoComplete="username"
          disabled={busy}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      {mode === "signin" ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="admin-password" className={labelClass}>
            Password
          </label>
          <input
            id="admin-password"
            type="password"
            className={inputClass}
            value={password}
            autoComplete="current-password"
            disabled={busy}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
      ) : null}

      {status === "error" ? (
        <p role="alert" className="border-[3px] border-alert px-3 py-2 text-sm text-alert">
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="border-[3px] border-accent bg-accent px-5 py-4 font-display text-[10px] uppercase tracking-wider text-black transition-colors hover:bg-transparent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60 sm:text-xs"
      >
        {mode === "signin"
          ? status === "submitting"
            ? "Signing in…"
            : "Sign In"
          : resetStatus === "sending"
            ? "Sending…"
            : "Send Reset Link"}
      </button>

      {mode === "signin" ? (
        <>
          <p className="text-xs leading-relaxed text-faded">
            Admin accounts are created privately by the site operator.
          </p>
          <button type="button" onClick={() => switchMode("reset")} className={linkClass}>
            Forgot your password?
          </button>
        </>
      ) : (
        <button type="button" onClick={() => switchMode("signin")} className={linkClass}>
          ← Back to sign in
        </button>
      )}
    </form>
  );
}
