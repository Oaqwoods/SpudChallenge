"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { callEdgeFunction } from "@/lib/supabase";
import { Panel } from "@/components/ui";

export function UnsubscribeTool() {
  const params = useSearchParams();
  const email = params.get("e") ?? "";
  const token = params.get("t") ?? "";

  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  if (!email || !token) {
    return (
      <Panel className="mt-6 p-5">
        <p className="text-sm leading-relaxed text-faded">
          Please use the unsubscribe link from your email. If you can&apos;t find
          it, contact us from the address you signed up with and we&apos;ll
          remove you manually.
        </p>
      </Panel>
    );
  }

  if (status === "done") {
    return (
      <Panel className="mt-6 p-5" role="status">
        <p className="font-display text-xs text-mint">UNSUBSCRIBED</p>
        <p className="mt-3 text-sm leading-relaxed text-foreground">
          You won&apos;t receive completed-trade emails anymore, and you&apos;ve
          been removed from the public follower wall.
        </p>
      </Panel>
    );
  }

  const unsubscribe = async () => {
    if (status === "submitting") return;
    setStatus("submitting");
    setMessage("");
    try {
      await callEdgeFunction("email-preferences", {
        action: "unsubscribe",
        email,
        token,
      });
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <Panel className="mt-6 p-5">
      <p className="text-sm leading-relaxed text-foreground">
        Unsubscribe <span className="text-accent">{email}</span> from ONE → FIVE
        completed-trade emails?
      </p>
      {status === "error" ? (
        <p role="alert" className="mt-3 text-sm text-alert">
          {message}
        </p>
      ) : null}
      <button
        type="button"
        onClick={unsubscribe}
        disabled={status === "submitting"}
        className="mt-4 border-[3px] border-alert px-5 py-3 font-display text-[10px] uppercase tracking-wider text-alert transition-colors hover:bg-alert hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "submitting" ? "Working…" : "Unsubscribe"}
      </button>
    </Panel>
  );
}
