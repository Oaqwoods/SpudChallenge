// Client-side UTM / landing-variant attribution capture (spec §33).
// Read at submission time — the URL never changes while a form is open.

export interface UtmAttribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  landing_variant?: string;
}

export function readUtm(): UtmAttribution {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const out: UtmAttribution = {};
  for (const key of ["utm_source", "utm_medium", "utm_campaign", "landing_variant"] as const) {
    const value = params.get(key);
    if (value) out[key] = value.slice(0, 200);
  }
  return out;
}
