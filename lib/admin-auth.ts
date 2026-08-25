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

// ---------------------------------------------------------------------------
// Login outcome interpretation (login form). Authentication (Supabase Auth)
// and authorization (app_admins membership) are two separate phases and must
// never be reported as each other: a membership-probe failure after a
// successful sign-in is an authorization error, not a wrong password.
// ---------------------------------------------------------------------------

export type LoginOutcome =
  | { kind: "auth_failed"; message: string }
  | { kind: "admin" }
  | { kind: "not_admin"; message: string }
  | { kind: "admin_check_failed"; message: string };

// Friendly wording for authorization failures AFTER Supabase Auth succeeded.
// Deliberately separate from friendlyAuthMessage so a membership/permission
// problem can never surface as "Incorrect email or password." Pure and
// tested; never echoes raw server messages.
export function friendlyAuthorizationMessage(error: unknown): string {
  const err = (error && typeof error === "object" ? error : {}) as {
    message?: unknown;
    code?: unknown;
  };
  const message = typeof err.message === "string" ? err.message : "";
  const lowered = message.toLowerCase();

  if (lowered.includes("not registered as an admin")) {
    return "Signed in successfully, but this account is not registered as an admin.";
  }
  // PostgREST 42501: the role could not even SELECT app_admins — a database
  // permission problem, not a problem with the person signing in.
  if (String(err.code ?? "") === "42501" || lowered.includes("permission denied")) {
    return "Signed in successfully, but the server denied the admin membership check (missing database permission). Contact the site operator.";
  }
  if (lowered.includes("fetch") || lowered.includes("network")) {
    return "Signed in successfully, but the admin check could not be reached. Check your network and try again.";
  }
  return "Signed in successfully, but your admin access could not be verified. Please try again.";
}

// Pure interpretation of one sign-in attempt so it can be unit tested.
// `authError` is the signInWithPassword error (if any); `probe` is the
// app_admins membership lookup that runs only after authentication succeeds
// (null when authentication already failed).
export function interpretLoginAttempt(
  authError: unknown,
  probe: { data: unknown; error: { message?: string; code?: string } | null } | null,
): LoginOutcome {
  if (authError) {
    return { kind: "auth_failed", message: friendlyAuthMessage(authError) };
  }
  if (!probe || probe.error) {
    return {
      kind: "admin_check_failed",
      message: friendlyAuthorizationMessage(probe?.error ?? new Error("Admin check unavailable")),
    };
  }
  if (!probe.data) {
    return {
      kind: "not_admin",
      message: friendlyAuthorizationMessage(
        new Error("This account is not registered as an admin."),
      ),
    };
  }
  return { kind: "admin" };
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

// ---------------------------------------------------------------------------
// Password recovery (/admin/reset-password/) — pure helpers, unit tested.
// ---------------------------------------------------------------------------

// Project password requirement for new admin passwords. Stricter than the
// Supabase default minimum (6) so a client-side pass implies a server pass.
export const ADMIN_PASSWORD_MIN_LENGTH = 8;

// Project password requirements for a new/updated admin password. Returns a
// user-facing error message, or null when the pair is acceptable.
export function validateNewPassword(password: string, confirm: string): string | null {
  if (!password || !confirm) {
    return "Please enter the new password in both fields.";
  }
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password !== confirm) {
    return "The passwords do not match.";
  }
  return null;
}

// True when a session was created from a password-recovery email link.
// Supabase stamps `recovery_sent_at` on the user for recovery sessions;
// structural typing keeps this free of supabase-js imports for testing.
export function isRecoverySession(
  session: { user?: { recovery_sent_at?: string } | null } | null,
): boolean {
  return typeof session?.user?.recovery_sent_at === "string";
}

// Reset-page path, shared by the redirectTo builder and the docs. No
// trailing slash: it must exactly match the Supabase Redirect URL allowlist
// entry; GitHub Pages serves the exported page for both forms.
const RESET_PATH = "/admin/reset-password";

// Where recovery emails should land: the reset page, passed as redirectTo to
// supabase.auth.resetPasswordForEmail. Must be added to the project's
// allowed Redirect URLs. Prefers the canonical site URL (inlined at build
// time), falling back to the current origin for local dev. Trailing slashes
// are stripped so the value exactly matches the allowlist entry.
export function passwordResetRedirectTo(
  siteUrl: string | undefined,
  origin: string,
): string {
  const base = (siteUrl && siteUrl.trim()) || origin;
  return `${base.replace(/\/+$/, "")}${RESET_PATH}`;
}

// Friendly wording for supabase.auth.updateUser failures on the reset page.
// Pure and tested; never echoes raw server messages.
export function friendlyPasswordUpdateMessage(error: unknown): string {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  const lowered = message.toLowerCase();

  if (
    lowered.includes("rate limit") ||
    lowered.includes("too many") ||
    lowered.includes("security purposes, you can only request this")
  ) {
    return "Too many attempts. Please wait a few minutes and try again.";
  }
  if (lowered.includes("fetch") || lowered.includes("network")) {
    return "Connection problem. Check your network and try again.";
  }
  if (lowered.includes("password") && (lowered.includes("short") || lowered.includes("at least"))) {
    return `Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`;
  }
  if (lowered.includes("same as the current") || lowered.includes("same as your current")) {
    return "The new password must be different from the current one.";
  }
  if (lowered.includes("expired") || lowered.includes("invalid") || lowered.includes("session")) {
    return "This reset link is no longer valid. Request a new one from the admin sign-in page and try again.";
  }
  return "Password update failed. Please try again.";
}
