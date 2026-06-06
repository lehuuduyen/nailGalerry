import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this project (a stray parent lockfile exists).
  turbopack: { root: __dirname },
  images: {
    // Gradient placeholders are plain <div>s; only uploaded/object-URL images
    // hit next/image, so skip the optimizer to keep the pure-frontend mock simple.
    unoptimized: true,
  },
};

export default nextConfig;
