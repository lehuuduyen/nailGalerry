import type { NextConfig } from "next";
import type { RemotePattern } from "next/dist/shared/lib/image-config";

// Allow the R2 dev domain + the configured CDN image domain (custom domain set
// in NEXT_PUBLIC_IMAGE_BASE). We currently serve cards via plain <img> + the
// Cloudflare image CDN, so `unoptimized` stays true; remotePatterns are here so
// next/image works too if we adopt it later.
const remotePatterns: RemotePattern[] = [{ protocol: "https", hostname: "*.r2.dev" }];
try {
  const base = process.env.NEXT_PUBLIC_IMAGE_BASE;
  if (base) remotePatterns.push({ protocol: "https", hostname: new URL(base).hostname });
} catch {
  /* ignore a malformed NEXT_PUBLIC_IMAGE_BASE */
}

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray parent lockfile exists).
  turbopack: { root: __dirname },
  images: {
    unoptimized: true,
    remotePatterns,
  },
};

export default nextConfig;
