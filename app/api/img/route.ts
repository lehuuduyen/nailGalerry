import { NextResponse } from "next/server";
import { isInstagramCdn } from "@/lib/img";

// ─────────────────────────────────────────────────────────────────────────
//  GET /api/img?src=<encoded Instagram CDN url>
//
//  Streams an Instagram/Facebook CDN image through our own origin so the
//  browser can render it (those CDNs set Cross-Origin-Resource-Policy:
//  same-origin, which blocks direct <img> embedding from other sites).
//
//  Restricted to IG/FB CDN hosts to avoid being an open proxy (SSRF).
//
//  Note: IG signed URLs expire after a while. For production, download and
//  store the bytes at import time instead of relying on the live CDN URL.
// ─────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

export async function GET(req: Request) {
  const src = new URL(req.url).searchParams.get("src");
  if (!src || !isInstagramCdn(src)) {
    return NextResponse.json({ error: "Unsupported image source." }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(src, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch image." }, { status: 502 });
  }

  if (!upstream.ok || !(upstream.headers.get("content-type") ?? "").startsWith("image/")) {
    return NextResponse.json(
      { error: "Image unavailable (it may have expired)." },
      { status: 502 },
    );
  }

  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
