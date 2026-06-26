import { NextResponse } from "next/server";
import { getDesignsPage, isDbConfigured } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────
//  GET /api/designs?limit=24&cursor=<opaque>  ->  { items, nextCursor }
//
//  Cursor-paginated, approved-only design feed with only the columns a card +
//  the current client filters need (no heavy `description`). Cursor is
//  (created_at, id) based so it stays stable as new designs are added — ready
//  for infinite scroll without an offset rewrite later.
//
//  CDN-cached 5 min (stale-while-revalidate 10 min). Public read.
// ─────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

const CACHE_HEADER = "public, s-maxage=300, stale-while-revalidate=600";

export async function GET(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ items: [], nextCursor: null });
  }
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") ?? 24);
  const cursor = searchParams.get("cursor") ?? undefined;

  try {
    const page = await getDesignsPage(limit, cursor);
    return NextResponse.json(page, { headers: { "Cache-Control": CACHE_HEADER } });
  } catch (err) {
    console.error("[designs] page failed:", err);
    return NextResponse.json({ items: [], nextCursor: null }, { status: 502 });
  }
}
