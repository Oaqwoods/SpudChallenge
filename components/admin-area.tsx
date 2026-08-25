"use client";

// Client-side gate for the admin area. Static hosting has no middleware, so
// the gate verifies the session here; real authorization is server-side
// (JWT validation by PostgREST + RLS is_admin() on every query). Nothing
// admin-specific renders until verification succeeds.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { checkAdminSession, type AdminCheck } from "@/lib/admin-auth";
import { getSupabase } from "@/lib/supabase";
import { Panel } from "@/components/ui";

const LOGIN_PATH = "/admin/login";
const RESET_PATH = "/admin/reset-password";
// Public admin routes that must render without an admin session: sign-in,
// and password recovery (the visitor holds a recovery session from the
// emailed link instead).
const PUBLIC_ADMIN_PATHS = [LOGIN_PATH, `${LOGIN_PATH}/`, RESET_PATH, `${RESET_PATH}/`];
const UNCONFIGURED: AdminCheck = {
  status: "error",
  message: "Admin is not configured yet (missing Supabase configuration).",
};

async function checkAdminForGate(): Promise<AdminCheck> {
  const supabase = getSupabase();
  if (!supabase) return UNCONFIGURED;
  return checkAdminSession(supabase);
}

interface AdminSessionContextValue {
  email: string | null;
  signOut: () => Promise<void>;
}

const AdminSessionContext = createContext<AdminSessionContextValue>({
  email: null,
  signOut: async () => {},
});

export function useAdminSession(): AdminSessionContextValue {
  return useContext(AdminSessionContext);
}

const buttonClass =
  "border-[3px] border-accent bg-accent px-4 py-2 font-display text-[9px] uppercase tracking-wider text-black transition-colors hover:bg-transparent hover:text-accent sm:text-[10px]";
const quietButtonClass =
  "border-[3px] border-edge px-4 py-2 font-display text-[9px] uppercase tracking-wider text-faded transition-colors hover:border-accent hover:text-accent sm:text-[10px]";

function NeutralPlaceholder() {
  // Intentionally empty: reveals nothing about the admin UI while the
  // session is still being verified (or the redirect is in flight).
  return <div aria-busy="true" className="min-h-[60vh]" />;
}

export function AdminArea({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublicAdminRoute = PUBLIC_ADMIN_PATHS.includes(pathname);

  const [check, setCheck] = useState<AdminCheck | null>(null);

  const runCheck = useCallback(async () => {
    const result = await checkAdminForGate();
    if (result.status === "unauthenticated") {
      window.location.replace(`${LOGIN_PATH}/`);
      return;
    }
    setCheck(result);
  }, []);

  useEffect(() => {
    if (isPublicAdminRoute) return;

    let cancelled = false;
    const guardedCheck = async () => {
      const result = await checkAdminForGate();
      if (cancelled) return;
      if (result.status === "unauthenticated") {
        window.location.replace(`${LOGIN_PATH}/`);
        return;
      }
      setCheck(result);
    };

    void guardedCheck();

    // Keep the gate honest across the session lifetime: drop to login on
    // sign-out, re-verify when the token refreshes.
    const supabase = getSupabase();
    const subscription = supabase
      ? supabase.auth.onAuthStateChange((event) => {
          if (cancelled) return;
          if (event === "SIGNED_OUT") {
            window.location.replace(`${LOGIN_PATH}/`);
            return;
          }
          if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
            void guardedCheck();
          }
        }).data.subscription
      : null;

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [isPublicAdminRoute]);

  const sessionValue = useMemo<AdminSessionContextValue>(
    () => ({
      email: check?.status === "admin" ? check.email : null,
      signOut: async () => {
        const supabase = getSupabase();
        // Global scope revokes the refresh token server-side too.
        await supabase?.auth.signOut();
        window.location.replace(`${LOGIN_PATH}/`);
      },
    }),
    [check],
  );

  if (isPublicAdminRoute) {
    return <>{children}</>;
  }

  if (!check || check.status === "unauthenticated") {
    return <NeutralPlaceholder />;
  }

  if (check.status === "error") {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Panel className="p-8 text-center" role="alert">
          <p className="font-display text-xs text-accent">ADMIN</p>
          <p className="mt-4 text-sm leading-relaxed text-faded">{check.message}</p>
          <button type="button" onClick={() => void runCheck()} className={`${buttonClass} mt-6`}>
            Try again
          </button>
        </Panel>
      </main>
    );
  }

  if (check.status === "not_admin") {
    return (
      <main className="mx-auto max-w-md px-4 py-16">
        <Panel className="p-8 text-center">
          <p className="font-display text-xs text-accent">NOT AUTHORIZED</p>
          <p className="mt-4 text-sm leading-relaxed text-faded">
            Signed in as {check.email ?? "this account"}, which is not
            registered as an admin.
          </p>
          <button
            type="button"
            onClick={() => void sessionValue.signOut()}
            className={`${buttonClass} mt-6`}
          >
            Sign out
          </button>
        </Panel>
      </main>
    );
  }

  return (
    <AdminSessionContext.Provider value={sessionValue}>
      <header className="sticky top-0 z-20 border-b-[3px] border-edge bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <p className="font-display text-xs text-accent">$1 → $5M · ADMIN</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="max-w-[40vw] truncate text-[11px] text-faded">{check.email}</span>
            <Link href="/" className="text-[11px] text-faded underline hover:text-accent">
              View site
            </Link>
            <button
              type="button"
              onClick={() => void sessionValue.signOut()}
              className={quietButtonClass}
            >
              Sign out
            </button>
          </div>
        </div>
      </header>
      {children}
    </AdminSessionContext.Provider>
  );
}
