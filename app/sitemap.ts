import type { MetadataRoute } from "next";
import { getPublishedDesigns, getPublishedSlugs } from "@/lib/db";
import { filterNails } from "@/lib/filter";
import { COLLECTIONS, MIN_COLLECTION_DESIGNS } from "@/lib/collections";
import { SITE_URL } from "@/lib/site";

// Refresh the sitemap hourly so newly approved designs get discovered.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let slugs: string[] = [];
  let designs: Awaited<ReturnType<typeof getPublishedDesigns>> = [];
  try {
    [slugs, designs] = await Promise.all([getPublishedSlugs(), getPublishedDesigns()]);
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

  // Only list collections that meet the minimum design count (skip thin pages).
  const collectionRoutes: MetadataRoute.Sitemap = COLLECTIONS.filter(
    (c) => filterNails(designs, c.filters, "").length >= MIN_COLLECTION_DESIGNS,
  ).map((c) => ({
    url: `${SITE_URL}/nails/${c.slug}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...designRoutes, ...collectionRoutes];
}
