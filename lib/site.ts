// Canonical site origin, used for absolute URLs in metadata, OpenGraph, canonical
// links and the sitemap. Set NEXT_PUBLIC_SITE_URL in production (e.g. your
// Vercel domain). Falls back to localhost for dev.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
).replace(/\/$/, "");

export const SITE_NAME = "NailLib";

/** Absolute URL for a design's public page. */
export function designUrl(slug: string): string {
  return `${SITE_URL}/designs/${slug}`;
}
