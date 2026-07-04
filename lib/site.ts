// Canonical site origin, used for absolute URLs in metadata, OpenGraph, canonical
// links and the sitemap (all server-side).
//
// Resolution order:
//   1. NEXT_PUBLIC_SITE_URL — set this to the real domain in production
//      (e.g. https://naillib.com). Inlined at build time.
//   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel's production domain, a safety net
//      so we never silently emit localhost URLs in a deployed build.
//   3. http://localhost:3000 — local dev fallback.
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();

export const SITE_NAME = "NailLib";

/** Absolute URL for a design's public page. */
export function designUrl(slug: string): string {
  return `${SITE_URL}/designs/${slug}`;
}
