import type { Metadata } from "next";
import Link from "next/link";
import { AdminResetPasswordForm } from "@/components/admin-reset-password-form";

export const metadata: Metadata = {
  title: "Reset Admin Password",
};

// Public route: reachable without an admin session because the visitor holds
// a Supabase password-recovery session from the emailed link. The admin
// layout's robots metadata keeps it out of search indexes.
export default function AdminResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-16">
      <p className="font-display text-xs text-accent">ONE → FIVE · ADMIN</p>
      <div className="mt-6">
        <AdminResetPasswordForm />
      </div>
      <Link href="/admin/login/" className="mt-6 text-center text-sm text-faded hover:text-accent">
        ← Back to admin sign in
      </Link>
    </main>
  );
}
