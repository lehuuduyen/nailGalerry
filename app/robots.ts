import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep private/non-content routes out of the index.
      disallow: ["/admin", "/api/", "/account", "/nail/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
