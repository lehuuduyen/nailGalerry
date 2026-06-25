import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { TAG_GROUPS } from "@/lib/constants";
import { insertDesign, isDbConfigured } from "@/lib/db";
import { isStorageConfigured, uploadToR2 } from "@/lib/storage";
import type { Nail, NailTags, TagKey } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/contribute  { title?, dataUrl }  ->  { ok, id }
//
//  Lets a signed-in visitor submit their own nail photo. It uploads the image
//  to R2 and inserts a single "pending" design row tagged with the uploader's
//  account (contributor name + ownerId). It can ONLY ever create a pending
//  entry — it never approves and never touches other rows.
//
//  The admin reviews these in Admin → Published designs → "Đợi duyệt"; the
//  uploader tracks status in their account page.
// ─────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Build the tag set from the user's choices, keeping only values that are in
 * each group's allowed list and falling back to the first value otherwise — so
 * a malformed or partial submission can never produce an invalid tag.
 */
function sanitizeTags(input: unknown): NailTags {
  const chosen = (input ?? {}) as Record<string, unknown>;
  const tags = {} as NailTags;
  for (const g of TAG_GROUPS) {
    const v = chosen[g.key];
    tags[g.key as TagKey] = typeof v === "string" && g.values.includes(v) ? v : g.values[0];
  }
  return tags;
}

/** Parse a base64 data URL into its mime type and raw bytes. */
function parseDataUrl(dataUrl: string): { mime: string; bytes: Buffer } | null {
  const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!mime.startsWith("image/")) return null;
  try {
    return { mime, bytes: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  if (!isStorageConfigured() || !isDbConfigured()) {
    return NextResponse.json({ error: "Uploads are not available right now." }, { status: 501 });
  }

  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please sign in to upload." }, { status: 401 });

  let body: { title?: string; dataUrl?: string; tags?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const name = user.username;
  if (!body.dataUrl) return NextResponse.json({ error: "Missing image." }, { status: 400 });
  const parsed = parseDataUrl(body.dataUrl);
  if (!parsed) return NextResponse.json({ error: "Invalid image." }, { status: 400 });
  if (parsed.bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large (max 8 MB)." }, { status: 413 });
  }

  // Upload the image to R2 under uploads/.
  let imageUrl: string;
  try {
    const ext = EXT[parsed.mime] ?? "jpg";
    const key = `uploads/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    imageUrl = await uploadToR2(key, parsed.bytes, parsed.mime);
  } catch {
    return NextResponse.json({ error: "Couldn't save the image." }, { status: 502 });
  }

  const title = (body.title ?? "").trim().slice(0, 80) || `${name}'s design`;
  const nail: Nail = {
    id: `user-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    title,
    ...sanitizeTags(body.tags),
    imageUrl,
    contributor: name,
    ownerId: user.id,
    source: { platform: "user", handle: name },
    status: "pending",
  };

  try {
    await insertDesign(nail);
    return NextResponse.json({ ok: true, id: nail.id });
  } catch (err) {
    console.error("[contribute] insert failed:", err);
    return NextResponse.json({ error: "Couldn't save your submission." }, { status: 502 });
  }
}
