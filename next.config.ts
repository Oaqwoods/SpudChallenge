import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // GitHub Pages is static hosting: the site ships as a static export.
  // All dynamic/secret-bearing work lives in Supabase Edge Functions/RPCs.
  output: "export",
  // Emit /route/index.html so every route resolves on GitHub Pages.
  trailingSlash: true,
  images: {
    // The default image optimization loader requires a Node server.
    unoptimized: true,
  },
};

export default nextConfig;
