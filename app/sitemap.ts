import type { MetadataRoute } from "next";

// Static site → static sitemap. Canonical production URLs only (spec §1B);
// the admin area is intentionally not indexed (see robots.txt).
const SITE_URL = "https://spudchallenge.online";

// Required for metadata routes under output: "export" — the sitemap is
// rendered once at build time and served as a plain file.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/offer/`,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/rules/`,
      changeFrequency: "weekly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/privacy/`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      url: `${SITE_URL}/terms/`,
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];
}
