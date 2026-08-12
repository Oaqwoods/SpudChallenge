// CORS allowlist for public Edge Function endpoints (spec §1B, §34).
// The production origin is always allowed; the GitHub Pages preview host and
// local dev are included for testing only.

const ALLOWED_ORIGINS: Array<string | RegExp> = [
  "https://spudchallenge.online",
  "http://localhost:3000",
  /^https:\/\/[a-z0-9][a-z0-9-]*\.github\.io$/,
];

export function isOriginAllowed(origin: string): boolean {
  return ALLOWED_ORIGINS.some((entry) =>
    typeof entry === "string" ? entry === origin : entry.test(origin),
  );
}

export function corsHeaders(origin: string | null): Record<string, string> {
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
