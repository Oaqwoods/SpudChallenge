// CORS allowlist for public Edge Function endpoints (spec §1B, §34).
//
// Supabase Edge Functions enforce CORS in function code — there is no
// dashboard "Allowed CORS origins" setting for functions. Supabase Storage
// serves its own platform-level CORS for signed uploads (authorized by
// the short-lived token, not the origin), so no configuration is needed there.
//
// Only exact application origins are allowed. No wildcards. Requests from any
// other origin get a non-matching allow-origin on preflight (browser blocks
// the response) and a 403 on the actual POST.

const ALLOWED_ORIGINS: ReadonlySet<string> = new Set([
  "https://spudchallenge.online", // production
  "https://oaqwoods.github.io", // GitHub Pages preview/testing deployment
  "http://localhost:3000", // local development
]);

export function isOriginAllowed(origin: string): boolean {
  return ALLOWED_ORIGINS.has(origin);
}

export function corsHeaders(origin: string | null): Record<string, string> {
  // Never reflect an unknown/disallowed origin and never emit "*": fall back
  // to the fixed production origin, which browsers will not match against a
  // foreign page's origin.
  const allowed =
    origin && isOriginAllowed(origin) ? origin : "https://spudchallenge.online";
  return {
    "access-control-allow-origin": allowed,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}
