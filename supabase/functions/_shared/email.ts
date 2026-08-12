// Pure helpers — runtime-agnostic (Deno Edge Functions + Node tests).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 254) return null;
  return trimmed;
}

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

// Trim, strip control characters, cap length. Rendered as plain text only,
// never as HTML (spec §36).
export function sanitizeText(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, maxLen);
  return cleaned.length > 0 ? cleaned : null;
}
