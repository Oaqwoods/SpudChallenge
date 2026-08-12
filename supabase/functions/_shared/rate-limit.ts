// Best-effort in-memory rate limiting for Edge Functions. Isolates may
// restart, so this is a friction layer for bursts, not a hard guarantee —
// documented as a known limitation for the security review (PROMPT 15).

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  nowMs: number = Date.now(),
): boolean {
  const existing = buckets.get(key);
  if (!existing || nowMs >= existing.resetAt) {
    buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}

export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || "unknown";
}
