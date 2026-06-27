import { NextResponse } from "next/server";
import { classifyNailImage } from "@/lib/autotag";
import { tagConfig } from "@/lib/gemini";

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/auto-tag  { imageUrl, caption? }  ->  AutoTags
//
//  Classifies a single nail-design photo with Google Gemini (vision). Returns
//  one value per tag group plus richer metadata (accent colours, season, style
//  origin, skin tone, undertone, alt text, description). The heavy lifting —
//  prompt, schema, validation — lives in lib/autotag.ts so the bulk endpoint
//  (/api/auto-tag/batch) shares exactly the same logic.
//
//  Needs GEMINI_TAG_API_KEY (or GEMINI_API_KEY). Without it, returns 501.
// ─────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!tagConfig().apiKey) {
    return NextResponse.json({ error: "Gemini is not configured." }, { status: 501 });
  }

  let body: { imageUrl?: string; caption?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body.imageUrl) return NextResponse.json({ error: "Missing imageUrl." }, { status: 400 });

  const result = await classifyNailImage({ imageUrl: body.imageUrl, caption: body.caption });
  if (!result) return NextResponse.json({ error: "Gemini unavailable." }, { status: 502 });

  return NextResponse.json(result);
}
