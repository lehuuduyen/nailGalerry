import type { MetadataRoute } from "next";
import { getPublishedSlugs } from "@/lib/db";
import { SITE_URL } from "@/lib/site";

// Refresh the sitemap hourly so newly approved designs get discovered.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let slugs: string[] = [];
  try {
    slugs = await getPublishedSlugs();
  } catch {
    /* DB unavailable — still return the static routes below */
  }

  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/advisor`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  const designRoutes: MetadataRoute.Sitemap = slugs.map((slug) => ({
    url: `${SITE_URL}/designs/${slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...designRoutes];
}
