import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { deleteDesign, getDesignImageUrl, getDesignsByOwner, isDbConfigured } from "@/lib/db";
import { deleteFromR2, isStorageConfigured, keyFromPublicUrl } from "@/lib/storage";

// ─────────────────────────────────────────────────────────────────────────
//  GET    /api/my-uploads          ->  { nails }   designs the user uploaded
//  DELETE /api/my-uploads { id }   ->  { ok }       remove one of their own
//
//  Both require a logged-in session and only ever touch the caller's own
//  rows (matched by owner_id), so the endpoint is safe to expose publicly.
// ─────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ nails: [] });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  try {
    const nails = await getDesignsByOwner(user.id);
    return NextResponse.json({ nails });
  } catch {
    return NextResponse.json({ nails: [] });
  }
}

export async function DELETE(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 501 });
  }
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  // Grab the image URL first so we can clean up R2 after a successful delete.
  const imageUrl = await getDesignImageUrl(body.id).catch(() => undefined);

  let removed = false;
  try {
    removed = await deleteDesign(body.id, user.id);
  } catch (err) {
    console.error("[my-uploads] delete failed:", err);
    return NextResponse.json({ error: "Couldn't update. Try again." }, { status: 502 });
  }
  if (!removed) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Best-effort image cleanup (don't fail the request on a storage hiccup).
  if (isStorageConfigured() && imageUrl) {
    const key = keyFromPublicUrl(imageUrl);
    if (key) await deleteFromR2(key).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
