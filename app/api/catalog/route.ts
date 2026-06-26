import { NextResponse } from "next/server";
import { getAllDesigns, isDbConfigured, replaceCatalog } from "@/lib/db";
import type { Nail } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
//  GET  /api/catalog  ->  { nails }
//  PUT  /api/catalog  { nails }  ->  { ok, count }
//
//  The gallery catalog now lives in Neon Postgres (table `designs`). GET is
//  public; PUT (admin, gated by proxy.ts) replaces the catalog to match the
//  posted array — upserting every design and removing any that are gone.
// ─────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

// CDN cache: serve repeat gallery reads from the edge for 5 min (likes/new
// approvals propagate within that window) and keep serving stale up to 10 min
// while revalidating — cuts origin DB hits and speeds up Home.
const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=600";

export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ nails: [] });
  try {
    const nails = await getAllDesigns();
    return NextResponse.json({ nails }, { headers: { "Cache-Control": CACHE_HEADER } });
  } catch {
    // Never hard-fail the gallery on a DB hiccup — show empty instead.
    return NextResponse.json({ nails: [] });
  }
}

export async function PUT(req: Request) {
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
