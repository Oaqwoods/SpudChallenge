import type { Metadata } from "next";
import Link from "next/link";
import { AdminLoginForm } from "@/components/admin-login-form";

export const metadata: Metadata = {
  title: "Admin Sign In",
};

export default function AdminLoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-16">
      <p className="font-display text-xs text-accent">ONE → FIVE · ADMIN</p>
      <div className="mt-6">
        <AdminLoginForm />
      </div>
      <Link href="/" className="mt-6 text-center text-sm text-faded hover:text-accent">
        ← Back to the challenge
      </Link>
    </main>
  );
}
