import { NextResponse } from "next/server";
import { isInstagramCdn } from "@/lib/img";
import { deleteFromR2, isStorageConfigured, keyFromPublicUrl, uploadToR2 } from "@/lib/storage";

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/store-image  { src }  ->  { url, stored }
//
//  Downloads an Instagram CDN image and uploads it to R2 so it survives the
//  Instagram link expiry. Returns the permanent URL.
//
//  If R2 isn't configured, it gracefully returns the original src (stored:false)
//  so the app keeps working in dev / before storage is set up.
// ─────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export async function POST(req: Request) {
  let body: { src?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const src = body.src;
  if (!src) return NextResponse.json({ error: "Missing src." }, { status: 400 });

  // Nothing to persist if storage isn't set up — keep the original URL.
  if (!isStorageConfigured()) {
    return NextResponse.json({ url: src, stored: false });
  }

  // Only persist Instagram CDN images (others are already durable URLs).
  if (!isInstagramCdn(src)) {
    return NextResponse.json({ url: src, stored: false });
  }

  try {
    const res = await fetch(src, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15_000),
    });
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!res.ok || !contentType.startsWith("image/")) {
      // Couldn't fetch (maybe already expired) — fall back to original.
      return NextResponse.json({ url: src, stored: false });
    }

    const bytes = await res.arrayBuffer();
    const ext = EXT[contentType] ?? "jpg";
    const key = `nails/${hash(src)}-${Date.now().toString(36)}.${ext}`;
    const url = await uploadToR2(key, bytes, contentType);

    return NextResponse.json({ url, stored: true });
  } catch {
    // Never block publishing on a storage hiccup — keep the original URL.
    return NextResponse.json({ url: src, stored: false });
  }
}

// DELETE { url }  ->  removes the object from R2 (if the url is an R2 url).
export async function DELETE(req: Request) {
  if (!isStorageConfigured()) return NextResponse.json({ ok: true, deleted: false });

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const key = body.url ? keyFromPublicUrl(body.url) : null;
  // Not an R2-hosted image (e.g. still an Instagram URL) — nothing to delete.
  if (!key) return NextResponse.json({ ok: true, deleted: false });

  try {
    await deleteFromR2(key);
    return NextResponse.json({ ok: true, deleted: true });
  } catch {
    return NextResponse.json({ error: "Couldn't delete the image." }, { status: 502 });
  }
}
