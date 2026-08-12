"use client";

import { useEffect, useState, type FormEvent } from "react";
import { friendlyAuthMessage } from "@/lib/admin-auth";
import { getSupabase } from "@/lib/supabase";
import { Panel } from "@/components/ui";

const inputClass =
  "w-full border-[3px] border-edge bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-accent";
const labelClass = "font-display text-[8px] uppercase text-faded sm:text-[9px]";

type Status = "idle" | "submitting" | "error";

export function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
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
      if (!probe.error && probe.data) {
        window.location.replace("/admin/");
      } else if (!probe.error) {
        await supabase.auth.signOut();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (status === "submitting") return;
    setMessage("");

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !password) {
      setStatus("error");
      setMessage("Please enter your email and password.");
      return;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setStatus("error");
      setMessage("Admin sign-in is not configured yet.");
      return;
    }

    setStatus("submitting");
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      if (error) throw error;

      // Signed in — but only registered admins may proceed. Non-admin sessions
      // are signed out immediately so no session lingers.
      const probe = await supabase
        .from("app_admins")
        .select("user_id")
        .eq("user_id", data.user.id)
        .maybeSingle();
      if (probe.error) {
        await supabase.auth.signOut();
        throw new Error("Could not verify your account. Please try again.");
      }
      if (!probe.data) {
        await supabase.auth.signOut();
        throw new Error("This account is not registered as an admin.");
      }
      window.location.replace("/admin/");
    } catch (err) {
      setStatus("error");
      setMessage(friendlyAuthMessage(err));
      setPassword("");
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

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
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
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
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
          onChange={(e) => setPassword(e.target.value)}
        />
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
        {status === "submitting" ? "Signing in…" : "Sign In"}
      </button>

      <p className="text-xs leading-relaxed text-faded">
        Admin accounts are created privately by the site operator.
      </p>
    </form>
  );
}
