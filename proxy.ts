import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE, verifyAdminToken } from "./lib/admin-auth";

// ─────────────────────────────────────────────────────────────────────────
//  Admin gate. Protects the /admin pages and the mutating API routes with a
//  signed session cookie (see lib/admin-auth.ts + /api/auth/admin-login).
//
//  We deliberately do NOT use HTTP Basic Auth here: its `WWW-Authenticate`
//  response makes the browser pop its native username/password dialog on ANY
//  401 in the /api/* space, which leaked the admin prompt onto public pages
//  (the app auto-fetches /api/catalog on every load). A cookie check never
//  emits that header, so ordinary visitors are never challenged.
//
//  Unauthenticated requests:
//    • /admin pages  → redirected to the /admin/login form.
//    • gated APIs    → plain 401 JSON (no WWW-Authenticate, no dialog).
//
//  Note: /api/catalog is intentionally NOT matched — GET is public and PUT
//  checks the admin cookie inside the route handler.
//
//  In Next.js 16 the old `middleware.ts` is renamed to `proxy.ts` and runs on
//  the Node.js runtime by default (so node:crypto in lib/admin-auth works).
// ─────────────────────────────────────────────────────────────────────────

export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // The login page and its endpoints must stay reachable without a session.
  if (pathname === "/admin/login") return NextResponse.next();

  if (verifyAdminToken(request.cookies.get(ADMIN_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // Admin page navigation → show the login form (preserve the intended path).
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Gated API routes → 401 without a Basic challenge.
  return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
}

export const config = {
  matcher: [
    "/admin",
    "/admin/:path*",
    "/api/store-image",
    "/api/auto-tag",
    "/api/auto-tag/:path*",
    "/api/instagram",
    "/api/instagram/:path*",
  ],
};
