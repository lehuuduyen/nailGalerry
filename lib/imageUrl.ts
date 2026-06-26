import { displaySrc } from "./img";

// ─────────────────────────────────────────────────────────────────────────
//  Resolve the <img src> for a stored image URL.
//
//  Images live on Cloudflare R2. In prod we serve them through a custom domain
//  (CDN-cached) set in NEXT_PUBLIC_IMAGE_BASE, optionally via Cloudflare Image
//  Resizing (/cdn-cgi/image/...) when NEXT_PUBLIC_IMAGE_RESIZE=1 — so cards get
//  ~400px WebP/AVIF instead of the 1080px original.
//
//  Fallbacks keep dev working:
//    • no NEXT_PUBLIC_IMAGE_BASE  → original URL (or the IG proxy for legacy
//      Instagram CDN links, via displaySrc).
//    • non-R2 URL                 → displaySrc (handles Instagram CORP proxy).
// ─────────────────────────────────────────────────────────────────────────

const BASE = (process.env.NEXT_PUBLIC_IMAGE_BASE ?? "").replace(/\/$/, "");
const RESIZE = process.env.NEXT_PUBLIC_IMAGE_RESIZE === "1";

function isR2(url: string): boolean {
  try {
    return /\.r2\.dev$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Object key (path after the host) for an R2 URL, e.g. "nails/abc.jpg". */
function keyOf(url: string): string | null {
  try {
    return new URL(url).pathname.replace(/^\/+/, "");
  } catch {
    return null;
  }
}

export type ImageOpts = { width?: number };

export function resolveImageSrc(url?: string, opts?: ImageOpts): string | undefined {
  if (!url) return undefined;

  // R2 image + custom domain configured → serve through the CDN domain.
  if (BASE && isR2(url)) {
    const key = keyOf(url);
    if (key) {
      const transform =
        RESIZE && opts?.width
          ? `cdn-cgi/image/width=${opts.width},format=auto,fit=cover/`
          : "";
      return `${BASE}/${transform}${key}`;
    }
  }

  // No custom domain, or a non-R2 (e.g. Instagram) URL: keep existing behavior
  // (proxies Instagram CDN links, leaves everything else as-is).
  return displaySrc(url);
}
