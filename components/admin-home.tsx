"use client";

import Link from "next/link";
import { useAdminSession } from "@/components/admin-area";
import { Panel } from "@/components/ui";

const COMING_NEXT = [
  "Dashboard overview: challenge state, countdown, current item and value",
  "Offer review: filter, shortlist, decline, verify",
  "Trade completion and publishing workflow",
];

export function AdminHome() {
  const { email } = useAdminSession();

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-base text-accent sm:text-lg">ADMIN AREA</h1>
      <p className="mt-2 text-sm text-faded">
        Signed in{email ? ` as ${email}` : ""}. Everything on these pages is
        private; access is enforced by Supabase Auth plus row-level security.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <Panel className="p-6">
          <p className="font-display text-[10px] uppercase text-accent">Coming next</p>
          <ul className="mt-3 flex flex-col gap-2">
            {COMING_NEXT.map((item) => (
              <li key={item} className="text-sm leading-relaxed text-foreground">
                ▸ {item}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel className="p-6">
          <p className="font-display text-[10px] uppercase text-accent">Quick links</p>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            <li>
              <Link href="/offer/" className="text-faded underline hover:text-accent">
                Public offer form
              </Link>
            </li>
            <li>
              <Link href="/" className="text-faded underline hover:text-accent">
                Public homepage
              </Link>
            </li>
          </ul>
        </Panel>
      </div>
    </main>
  );
}
