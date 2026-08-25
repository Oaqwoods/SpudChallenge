// Log sanitization (playbook PROMPT 28: verify sensitive/private data is
// not logged). Edge Functions log errors from catch blocks; raw error
// objects can carry more than the message — PostgREST errors include
// `details`, and a unique-constraint violation's DETAIL contains the
// conflicting value (e.g. an email address from a follow-signup race).
// Only the short `message` text is safe to log, so every console.error in
// the functions routes through errorMessage().

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err !== null && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "unknown error";
}
