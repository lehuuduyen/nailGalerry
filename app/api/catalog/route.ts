import { NextResponse } from "next/server";
import { getFromR2, isStorageConfigured, uploadToR2 } from "@/lib/storage";

// ─────────────────────────────────────────────────────────────────────────
//  GET  /api/catalog  ->  { nails }
//  PUT  /api/catalog  { nails }  ->  { ok, count }
//
//  The published gallery is stored as a single catalog.json object on R2 — no
//  database. Every browser reads it via GET, so the gallery is shared across
//  devices/visitors. The admin writes it via PUT on approve / clear.
// ─────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

const CATALOG_KEY = "catalog.json";

export async function GET() {
  if (!isStorageConfigured()) return NextResponse.json({ nails: [] });
  try {
    const buf = await getFromR2(CATALOG_KEY);
    if (!buf) return NextResponse.json({ nails: [] });
    const nails = JSON.parse(new TextDecoder().decode(buf));
    return NextResponse.json({ nails: Array.isArray(nails) ? nails : [] });
  } catch {
    // Never hard-fail the gallery on a storage hiccup — show empty instead.
    return NextResponse.json({ nails: [] });
  }
}

export async function PUT(req: Request) {
  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "R2 storage is not configured." }, { status: 501 });
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

  const data = new TextEncoder().encode(JSON.stringify(body.nails));
  // Retry a couple times — R2 occasionally returns a transient 5xx, and a
  // dropped catalog write would silently lose the gallery update.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await uploadToR2(CATALOG_KEY, data.buffer as ArrayBuffer, "application/json", "no-cache");
      return NextResponse.json({ ok: true, count: body.nails.length });
    } catch {
      if (attempt < 2) await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  return NextResponse.json({ error: "Couldn't write the catalog." }, { status: 502 });
}
