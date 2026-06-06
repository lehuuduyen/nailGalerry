// Instagram/Facebook CDN images send `Cross-Origin-Resource-Policy: same-origin`,
// so the browser refuses to render them via <img> on another origin. We route
// those through our own /api/img proxy (server-to-server fetch ignores CORP),
// which serves the bytes from our origin. Other hosts are used as-is.

export const CDN_HOST_RE = /(\.cdninstagram\.com|\.fbcdn\.net)$/i;

/** True if the URL points at an Instagram/Facebook CDN host. */
export function isInstagramCdn(url: string): boolean {
  try {
    return CDN_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** The URL to actually put in <img src> — proxied for IG/FB CDN, else unchanged. */
export function displaySrc(url?: string): string | undefined {
  if (!url) return url;
  if (isInstagramCdn(url)) return `/api/img?src=${encodeURIComponent(url)}`;
  return url;
}
