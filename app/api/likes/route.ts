import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { adjustLike, isDbConfigured } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────
//  POST   /api/likes  { id }  ->  { count }   like  (+1)
//  DELETE /api/likes  { id }  ->  { count }   unlike (−1, never below 0)
//
//  Public endpoint backing the heart ("tym") counter on each design. The
//  client only sends +1 / −1 in step with its own saved/favourited state, so
//  a browser contributes at most one like per design.
// ─────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

async function handle(req: Request, delta: 1 | -1) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Likes are not available right now." }, { status: 501 });
  }
  // Liking requires an account.
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in to like." }, { status: 401 });

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  try {
    const count = await adjustLike(body.id, delta);
    if (count === null) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return NextResponse.json({ count });
  } catch (err) {
    console.error("[likes] failed:", err);
    return NextResponse.json({ error: "Couldn't update likes." }, { status: 502 });
  }
}

export const POST = (req: Request) => handle(req, 1);
export const DELETE = (req: Request) => handle(req, -1);
