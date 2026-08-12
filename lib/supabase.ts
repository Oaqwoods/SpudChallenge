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
