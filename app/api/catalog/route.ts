import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAllDesigns, getPublishedDesigns, isDbConfigured, replaceCatalog } from "@/lib/db";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";
import type { Nail } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
//  GET  /api/catalog  ->  { nails }
//  PUT  /api/catalog  { nails }  ->  { ok, count }
//
//  The gallery catalog lives in Neon Postgres (table `designs`). GET is public
//  but returns PUBLISHED designs only — pending submissions are never exposed
//  to visitors. An authenticated admin (admin cookie) gets the full list,
//  including pending, so the admin dashboard can review/approve them. PUT
//  (admin only) replaces the catalog to match the posted array.
// ─────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

// CDN cache: serve repeat gallery reads from the edge for 5 min (likes/new
// approvals propagate within that window) and keep serving stale up to 10 min
// while revalidating — cuts origin DB hits and speeds up Home.
const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=600";

async function isAdmin(): Promise<boolean> {
  return verifyAdminToken((await cookies()).get(ADMIN_COOKIE)?.value);
}

export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ nails: [] });
  try {
    // Admins see everything (incl. pending, uncached); the public sees only
    // published designs, served from the CDN.
    if (await isAdmin()) {
      const nails = await getAllDesigns();
      return NextResponse.json({ nails }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const nails = await getPublishedDesigns();
    return NextResponse.json({ nails }, { headers: { "Cache-Control": CACHE_HEADER } });
  } catch {
    // Never hard-fail the gallery on a DB hiccup — show empty instead.
    return NextResponse.json({ nails: [] });
  }
}

export async function PUT(req: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
  }
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 501 });
  }

  let body: { nails?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!Array.isArray(body.nails)) {
    return NextResponse.json({ error: "Missing nails array." }, { status: 400 });
  }

  try {
    await replaceCatalog(body.nails as Nail[]);
    return NextResponse.json({ ok: true, count: body.nails.length });
  } catch (err) {
    console.error("[catalog] PUT failed:", err);
    return NextResponse.json({ error: "Couldn't save the catalog." }, { status: 502 });
  }
}
