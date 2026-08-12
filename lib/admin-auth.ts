// Admin session verification for the static-export admin area.
//
// GitHub Pages has no server runtime (no middleware/cookies), so route
// protection is a client-side gate — but authorization is NOT merely a UI
// check: the session JWT is validated server-side by PostgREST during the
// app_admins membership probe below, and every admin data query is enforced
// by RLS (public.is_admin()). A forged/expired token passes neither.

import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminCheck =
  | { status: "admin"; userId: string; email: string | null }
  | { status: "not_admin"; userId: string; email: string | null }
  | { status: "unauthenticated" }
  | { status: "error"; message: string };

interface SessionUser {
  id: string;
  email?: string | null;
}

interface ProbeResult {
  data: unknown;
  error: { message?: string } | null;
}

// Pure interpretation of the membership probe so it can be unit tested.
// `data` is the app_admins row (or null); a PostgREST error means the server
// rejected the request (bad/expired JWT, network failure) — never treat that
// as admin.
export function interpretAdminProbe(
  user: SessionUser | null,
  probe: ProbeResult,
): AdminCheck {
  if (!user?.id) return { status: "unauthenticated" };
  const email = user.email ?? null;
  if (probe.error) {
    return {
      status: "error",
      message: "Could not verify your session. Please try again.",
    };
  }
  if (probe.data) {
    return { status: "admin", userId: user.id, email };
  }
  return { status: "not_admin", userId: user.id, email };
}

// Server-side verification: PostgREST validates the session JWT (signature +
// expiry) while answering the app_admins query; RLS restricts every admin
// table to is_admin() regardless of what the client claims.
export async function checkAdminSession(supabase: SupabaseClient): Promise<AdminCheck> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return { status: "unauthenticated" };

  const probe = await supabase
    .from("app_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  return interpretAdminProbe(user, { data: probe.data, error: probe.error });
}

// Friendly wording for Supabase Auth failures (login form). Pure and tested.
export function friendlyAuthMessage(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  const lowered = message.toLowerCase();

  if (lowered.includes("invalid login credentials")) {
    return "Incorrect email or password.";
  }
  if (lowered.includes("email not confirmed")) {
    return "This email address has not been confirmed yet.";
  }
  if (
    lowered.includes("rate limit") ||
    lowered.includes("too many") ||
    lowered.includes("security purposes, you can only request this")
  ) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (
    lowered.includes("fetch") ||
    lowered.includes("network") ||
    lowered.includes("failed to fetch")
  ) {
    return "Connection problem. Check your network and try again.";
  }
  if (lowered.includes("password") && lowered.includes("short")) {
    return "That password is too short.";
  }
  return "Sign-in failed. Please check your details and try again.";
}
