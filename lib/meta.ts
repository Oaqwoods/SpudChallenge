// Meta advertising measurement helpers (playbook PROMPT 40 / build spec §39).
// Consent-gated, best-effort, PII-free browser measurement — an ADDITIONAL
// system next to the first-party analytics in lib/analytics.ts, never a
// replacement. No Automatic Advanced Matching, no form-field scraping: the
// only things ever sent to Meta are the Pixel script's own PageView/Lead
// signals, a conversion_type tag and a shared deduplication event_id.

export type MetaConsentChoice = "allowed" | "declined";
export type MetaConversionType = "follower" | "trade_offer";

export const META_CONSENT_STORAGE_KEY = "spud_meta_consent";
// Window events used to keep the banner/loader in sync without reloads.
export const META_CONSENT_CHANGED_EVENT = "spud-meta-consent-changed";
export const META_CONSENT_REOPEN_EVENT = "spud-meta-consent-reopen";
const META_PIXEL_SCRIPT_ID = "meta-pixel";

// Meta Events Manager "Test events" support. The tool opens the site with
// ?test_event_code=…; the Pixel tags browser events purely from that URL
// parameter (fbevents.js has no per-call option — verified against the
// shipped script), so the code must survive internal navigations. It is
// captured into sessionStorage and restored into the URL on page load, and
// also forwarded to the Edge Functions so CAPI Leads carry the same tag.
export const META_TEST_CODE_PARAM = "test_event_code";
const META_TEST_CODE_SESSION_KEY = "spud_meta_test_event_code";

export interface MetaRequestMetadata {
  consented: true;
  event_id: string;
  fbp?: string;
  fbc?: string;
  test_event_code?: string;
}

// NEXT_PUBLIC_* values are inlined at build time; empty string when the
// GitHub Actions variable is absent and every helper below no-ops.
export const META_PIXEL_ID: string = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

export function metaPixelConfigured(pixelId: string = META_PIXEL_ID): boolean {
  return typeof pixelId === "string" && pixelId.trim().length > 0;
}

// --- Consent (stored only in the visitor's own browser) ------------------

export function parseMetaConsent(raw: string | null): MetaConsentChoice | null {
  if (raw === "allowed" || raw === "declined") return raw;
  return null;
}

export function readMetaConsent(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): MetaConsentChoice | null {
  try {
    return parseMetaConsent(storage.getItem(META_CONSENT_STORAGE_KEY));
  } catch {
    return null;
  }
}

// The footer "change my choice" control sets this flag; the banner treats
// it as "show again" until the visitor picks (writeMetaConsent clears it).
let reopenRequested = false;

export function writeMetaConsent(
  choice: MetaConsentChoice,
  storage: Pick<Storage, "setItem"> = window.localStorage,
): void {
  reopenRequested = false;
  try {
    storage.setItem(META_CONSENT_STORAGE_KEY, choice);
  } catch {
    // Storage blocked (private mode etc.): the choice applies for this
    // session only; Meta simply stays off on the next visit.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(META_CONSENT_CHANGED_EVENT));
  }
}

export function requestMetaConsentChoiceChange(): void {
  reopenRequested = true;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(META_CONSENT_REOPEN_EVENT));
  }
}

export function metaConsentBannerVisible(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): boolean {
  return reopenRequested || readMetaConsent(storage) === null;
}

// Meta measurement is active only after an explicit Allow.
export function metaMeasurementAllowed(
  storage: Pick<Storage, "getItem"> = window.localStorage,
): boolean {
  return readMetaConsent(storage) === "allowed";
}

// --- Deduplication + attribution metadata --------------------------------

export function newMetaEventId(
  randomUUID: () => string = () => crypto.randomUUID(),
): string {
  return randomUUID();
}

// Read Meta's attribution cookies when present. Optional everywhere: blocked
// or missing cookies never break anything (returns an empty object).
export function readMetaAttributionCookies(
  cookieString: string = typeof document === "undefined" ? "" : document.cookie,
): { fbp?: string; fbc?: string } {
  const out: { fbp?: string; fbc?: string } = {};
  if (!cookieString) return out;
  for (const part of cookieString.split(";")) {
    const [rawName, ...rest] = part.split("=");
    const name = rawName?.trim();
    const value = rest.join("=").trim();
    if (!value || value.length > 1024) continue;
    if (name === "_fbp") out.fbp = value;
    if (name === "_fbc") out.fbc = value;
  }
  return out;
}

// --- Meta "Test events" code (Events Manager test sessions) ---------------

// Meta test-event codes are short alphanumerics; anything else is dropped.
export function validateMetaTestEventCode(raw: string | null): string | null {
  if (!raw || !/^[A-Za-z0-9]{1,64}$/.test(raw)) return null;
  return raw;
}

export function readMetaTestEventCode(search: string): string | null {
  if (!search) return null;
  try {
    return validateMetaTestEventCode(new URLSearchParams(search).get(META_TEST_CODE_PARAM));
  } catch {
    return null;
  }
}

// URL wins; otherwise fall back to the code captured earlier this session.
// Stores a URL-provided code so it survives internal navigations.
export function captureMetaTestEventCode(
  search: string = typeof window === "undefined" ? "" : window.location.search,
  session: Pick<Storage, "getItem" | "setItem"> = window.sessionStorage,
): string | null {
  const fromUrl = readMetaTestEventCode(search);
  if (fromUrl) {
    try {
      session.setItem(META_TEST_CODE_SESSION_KEY, fromUrl);
    } catch {
      // Session storage blocked: the code still works for this page.
    }
    return fromUrl;
  }
  try {
    return validateMetaTestEventCode(session.getItem(META_TEST_CODE_SESSION_KEY));
  } catch {
    return null;
  }
}

// Pure helper: returns href with the test code (re)added as a query param.
export function withMetaTestEventCode(href: string, code: string): string {
  const url = new URL(href);
  url.searchParams.set(META_TEST_CODE_PARAM, code);
  return url.toString();
}

// The optional `meta` object attached to follower/offer submissions. Built
// ONLY when the visitor allowed Meta measurement; otherwise null — nothing
// Meta-related leaves the browser without consent.
export function buildMetaRequestMetadata(
  storage: Pick<Storage, "getItem"> = window.localStorage,
  session: Pick<Storage, "getItem" | "setItem"> = window.sessionStorage,
  search: string = typeof window === "undefined" ? "" : window.location.search,
): MetaRequestMetadata | null {
  if (!metaMeasurementAllowed(storage)) return null;
  const metadata: MetaRequestMetadata = {
    consented: true,
    event_id: newMetaEventId(),
    ...readMetaAttributionCookies(),
  };
  const testEventCode = captureMetaTestEventCode(search, session);
  if (testEventCode) metadata.test_event_code = testEventCode;
  return metadata;
}

// --- Pixel loading + events ----------------------------------------------

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    _fbq?: unknown;
  }
}

// Canonical Meta loader with a bare init — deliberately no Advanced
// Matching parameters and no PageView here (PageView is fired explicitly
// after init so the order is testable).
export function metaPixelScriptSource(pixelId: string): string {
  return (
    `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?` +
    `n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;` +
    `n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;` +
    `t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,` +
    `document,'script','https://connect.facebook.net/en_US/fbevents.js');` +
    `fbq('init','${pixelId.replace(/[^0-9]/g, "")}');`
  );
}

// Injects the Pixel script once. Returns false (no-op) when there is no
// Pixel ID, the document is unavailable, or it was already injected.
export function injectMetaPixel(
  pixelId: string = META_PIXEL_ID,
  doc: Document = document,
): boolean {
  if (!metaPixelConfigured(pixelId) || !doc) return false;
  if (doc.getElementById(META_PIXEL_SCRIPT_ID)) return false;
  const script = doc.createElement("script");
  script.id = META_PIXEL_SCRIPT_ID;
  script.async = true;
  script.text = metaPixelScriptSource(pixelId.trim());
  doc.head.appendChild(script);
  return true;
}

export function trackMetaPageView(ctx: Pick<Window, "fbq"> = window): void {
  try {
    ctx.fbq?.("track", "PageView");
  } catch {
    // Measurement is best-effort.
  }
}

// Fire the browser Lead. Callers are responsible for firing this ONLY after
// the backend confirmed success and with the same event_id the server used
// for its Conversions API Lead (Meta deduplicates on event_id).
export function trackMetaLead(
  conversionType: MetaConversionType,
  eventId: string,
  ctx: Pick<Window, "fbq"> = window,
): void {
  if (conversionType !== "follower" && conversionType !== "trade_offer") return;
  if (!eventId) return;
  try {
    ctx.fbq?.("track", "Lead", { conversion_type: conversionType }, { eventID: eventId });
  } catch {
    // Measurement is best-effort.
  }
}

// Consent-checked wrapper used by the forms: fires the browser Lead only
// when Meta measurement is allowed (the Pixel only loads under the same
// condition, but the consent could change mid-session).
export function fireMetaLead(
  conversionType: MetaConversionType,
  eventId: string,
  storage: Pick<Storage, "getItem"> = window.localStorage,
  ctx: Pick<Window, "fbq"> = window,
): void {
  if (!metaMeasurementAllowed(storage)) return;
  trackMetaLead(conversionType, eventId, ctx);
}
