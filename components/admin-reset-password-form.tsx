"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  friendlyPasswordUpdateMessage,
  isRecoverySession,
  validateNewPassword,
} from "@/lib/admin-auth";
import { getSupabase } from "@/lib/supabase";
import { Panel } from "@/components/ui";

const inputClass =
  "w-full border-[3px] border-edge bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent";
const labelClass = "font-display text-[8px] uppercase text-faded sm:text-[9px]";
const buttonClass =
  "border-[3px] border-accent bg-accent px-5 py-4 font-display text-[10px] uppercase tracking-wider text-black transition-colors hover:bg-transparent hover:text-accent disabled:cursor-not-allowed disabled:opacity-60 sm:text-xs";

// supabase-js exchanges the recovery link (PKCE `?code=` or implicit
// `#access_token=…&type=recovery`) right after client init; allow enough
// time for that round-trip before declaring the link invalid/expired.
const RECOVERY_GRACE_MS = 6000;
// Let the success confirmation register before bouncing to the login page.
const SUCCESS_REDIRECT_MS = 2000;

type LinkStatus = "checking" | "ready" | "invalid";
type UpdateStatus = "idle" | "submitting" | "success" | "error";

export function AdminResetPasswordForm() {
  const [linkStatus, setLinkStatus] = useState<LinkStatus>("checking");
  const [recoveryEmail, setRecoveryEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [message, setMessage] = useState("");
  // getSupabase() is a memoized singleton; env vars are inlined at build
  // time, so this is stable across renders and SSR/hydration.
  const configured = getSupabase() !== null;

  // Resolve the recovery session created when the emailed link was clicked.
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    let cancelled = false;
    let settled = false;

    const accept = (email: string | null) => {
      if (cancelled || settled) return;
      settled = true;
      clearTimeout(timer);
      setRecoveryEmail(email);
      setLinkStatus("ready");
    };

    // Fired by supabase-js once it exchanges the recovery URL (both the
    // implicit-hash and PKCE-code flows emit PASSWORD_RECOVERY).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session && isRecoverySession(session)) {
        accept(session.user.email ?? null);
      }
    });

    // Fast path: session already exchanged and persisted (e.g. page reload
    // before the password was changed).
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (session && isRecoverySession(session)) {
        accept(session.user.email ?? null);
      }
    })();

    // No recovery session arrived in time: the link is invalid/expired (or
    // was opened without a recovery URL at all). Re-check once in case the
    // exchange finished at the deadline, then give up.
    const timer = setTimeout(async () => {
      if (cancelled || settled) return;
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (session && isRecoverySession(session)) {
        accept(session.user.email ?? null);
        return;
      }
      if (!cancelled) setLinkStatus("invalid");
    }, RECOVERY_GRACE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  // After a successful update, show the confirmation briefly, then bounce
  // to the login page so the admin signs in with the new password.
  useEffect(() => {
    if (updateStatus !== "success") return;
    const timer = setTimeout(() => {
      window.location.replace("/admin/login/");
    }, SUCCESS_REDIRECT_MS);
    return () => clearTimeout(timer);
  }, [updateStatus]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (updateStatus === "submitting" || updateStatus === "success") return;
    setMessage("");

    const validationError = validateNewPassword(password, confirm);
    if (validationError) {
      setUpdateStatus("error");
      setMessage(validationError);
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setUpdateStatus("error");
      setMessage("Admin is not configured yet (missing Supabase configuration).");
      return;
    }

    setUpdateStatus("submitting");
    try {
      const { data, error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      if (!data.user) throw new Error("Session expired");
      setUpdateStatus("success");
      setPassword("");
      setConfirm("");
    } catch (err) {
      setUpdateStatus("error");
      setMessage(friendlyPasswordUpdateMessage(err));
    }
  };

  if (!configured) {
    return (
      <Panel className="p-8 text-center">
        <p className="text-sm leading-relaxed text-faded">
          Admin is not configured yet (missing Supabase configuration).
        </p>
      </Panel>
    );
  }

  if (linkStatus === "checking") {
    return (
      <Panel className="p-8 text-center">
        <p aria-busy="true" className="text-sm leading-relaxed text-faded">
          Checking your reset link…
        </p>
      </Panel>
    );
  }

  if (linkStatus === "invalid") {
    return (
      <Panel className="p-8 text-center" role="alert">
        <p className="font-display text-xs text-accent">RESET LINK</p>
        <p className="mt-4 text-sm leading-relaxed text-faded">
          This password reset link is invalid or has expired. Reset links can
          only be used within a limited time — request a new one with
          “Forgot your password?” on the admin sign-in page, then follow the
          new link.
        </p>
      </Panel>
    );
  }

  if (updateStatus === "success") {
    return (
      <Panel className="p-8 text-center" role="status">
        <p className="font-display text-xs text-accent">PASSWORD UPDATED</p>
        <p className="mt-4 text-sm leading-relaxed text-faded">
          Your admin password has been changed. Redirecting you to the sign-in
          page…
        </p>
      </Panel>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div>
        <p className="font-display text-xs text-accent">RESET PASSWORD</p>
        {recoveryEmail ? (
          <p className="mt-2 truncate text-xs text-faded">{recoveryEmail}</p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="reset-password" className={labelClass}>
          New password
        </label>
        <input
          id="reset-password"
          type="password"
          className={inputClass}
          value={password}
          autoComplete="new-password"
          disabled={updateStatus === "submitting"}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="reset-password-confirm" className={labelClass}>
          Confirm new password
        </label>
        <input
          id="reset-password-confirm"
          type="password"
          className={inputClass}
          value={confirm}
          autoComplete="new-password"
          disabled={updateStatus === "submitting"}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      {updateStatus === "error" ? (
        <p role="alert" className="border-[3px] border-alert px-3 py-2 text-sm text-alert">
          {message}
        </p>
      ) : null}

      <button type="submit" disabled={updateStatus === "submitting"} className={buttonClass}>
        {updateStatus === "submitting" ? "Updating…" : "Update Password"}
      </button>

      <p className="text-xs leading-relaxed text-faded">
        Passwords must be at least {ADMIN_PASSWORD_MIN_LENGTH} characters.
      </p>
    </form>
  );
}
