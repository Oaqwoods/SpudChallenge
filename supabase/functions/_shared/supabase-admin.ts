// Service-role client for Edge Functions only. The service-role key is
// injected automatically by Supabase at deploy time and never ships to the
// browser.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

let client: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (client) return client;
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) {
    throw new Error("Supabase environment is not configured.");
  }
  client = createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
  return client;
}
