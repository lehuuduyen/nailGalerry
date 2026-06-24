import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────
//  Admin auth. Protects the /admin page and every mutating API route with
//  HTTP Basic Auth using ADMIN_USER / ADMIN_PASSWORD from the environment.
//
//  Public reads stay open: GET /api/catalog (the shared gallery) and the
//  image proxy are never gated, so visitors can browse without logging in.
//
//  In Next.js 16 the old `middleware.ts` is renamed to `proxy.ts` and runs on
//  the Node.js runtime by default.
// ─────────────────────────────────────────────────────────────────────────

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="NailGallery Admin", charset="UTF-8"' },
  });
}

export function proxy(request: NextRequest): NextResponse {
  // Anyone can read the gallery catalog.
  if (request.method === "GET" && request.nextUrl.pathname === "/api/catalog") {
    return NextResponse.next();
  }

  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASSWORD;
  // If no credentials are configured, don't lock anyone out (dev convenience).
  if (!user || !pass) return NextResponse.next();

  const header = request.headers.get("authorization");
  if (header?.startsWith("Basic ")) {
    let decoded = "";
    try {
      decoded = atob(header.slice(6));
    } catch {
      return unauthorized();
    }
    const sep = decoded.indexOf(":");
    const u = decoded.slice(0, sep);
    const p = decoded.slice(sep + 1);
    if (u === user && p === pass) return NextResponse.next();
  }

  return unauthorized();
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/api/catalog",
    "/api/store-image",
    "/api/auto-tag",
    "/api/instagram",
    "/api/instagram/:path*",
  ],
};
