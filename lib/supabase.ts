import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

// Browser-side client only. Uses the PUBLIC anon key; access is governed by
// RLS + the public-safe views. Never import service-role material here.
export function getSupabase(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!client) client = createClient(url, anonKey);
  return client;
}

// Public URL for an object in the public trade-media storage bucket.
export function publicMediaUrl(storagePath: string): string {
  return `${url ?? ""}/storage/v1/object/public/trade-media/${storagePath}`;
}

export function edgeFunctionUrl(name: string): string | null {
  if (!url) return null;
  return `${url}/functions/v1/${name}`;
}

// Error carrying the HTTP status and parsed JSON payload so callers can react
// to structured failure codes (e.g. current_item_changed).
export class EdgeFunctionError extends Error {
  status: number;
  payload: { error?: string; code?: string } | null;

  constructor(message: string, status: number, payload: { error?: string; code?: string } | null) {
    super(message);
    this.name = "EdgeFunctionError";
    this.status = status;
    this.payload = payload;
  }
}

// POST to a Supabase Edge Function with the public anon key. The anon key is
// public by design; authorization is enforced inside the function/RLS.
export async function callEdgeFunction<T>(name: string, body: unknown): Promise<T> {
  const endpoint = edgeFunctionUrl(name);
  if (!endpoint || !anonKey) {
    throw new Error("Signup is not available yet. Please try again later.");
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(body),
  });
  let data: { error?: string; code?: string } | null = null;
  try {
    data = (await res.json()) as { error?: string; code?: string } | null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new EdgeFunctionError(
      data?.error ?? `Request failed (${res.status}). Please try again.`,
      res.status,
      data,
    );
  }
  return data as T;
}
