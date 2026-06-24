import { NextResponse } from "next/server";
import { TAG_GROUPS } from "@/lib/constants";

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/auto-tag  { imageUrl, caption? }  ->  { tags }
//
//  Classifies a nail-design photo with Google Gemini (vision). Returns one
//  value per TAG_GROUPS group, constrained to the allowed values via a JSON
//  response schema so the output always maps cleanly onto our tag editor.
//
//  Needs GEMINI_API_KEY (Google AI Studio). If it isn't set, returns 501 and
//  the client falls back to its random placeholder tags.
//
//  Env:
//    GEMINI_API_KEY   Google AI Studio API key (aistudio.google.com/apikey)
//    GEMINI_MODEL     optional, defaults to "gemini-2.0-flash" (free tier)
// ─────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Build the response schema once: an object with one enum-constrained string
// per tag group, so Gemini can only return values we actually support. An
// `observations` field comes first so the model describes the nails before
// committing to choices (a small chain-of-thought boost); we ignore it when
// mapping the result back onto our tags.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    observations: { type: "STRING" },
    ...Object.fromEntries(TAG_GROUPS.map((g) => [g.key, { type: "STRING", enum: g.values }])),
  },
  required: ["observations", ...TAG_GROUPS.map((g) => g.key)],
  propertyOrdering: ["observations", ...TAG_GROUPS.map((g) => g.key)],
};

// Extra guidance for the values models most often get wrong.
const HINTS: Partial<Record<string, string>> = {
  color:
    "the dominant nail-polish colour. Look only at the painted nail surface — IGNORE " +
    "skin tone, background, and gold/glitter accents. For a French or two-tone look " +
    "(e.g. a pink base with white tips/border), pick the colour that covers most of the " +
    "nail bed (usually Pink, not White). Treat ALL shades of pink — bubblegum, hot pink, " +
    "rose, dusty rose, mauve, magenta — as Pink. Use Pastel only for a very pale washed-out " +
    "tint. Reserve Red strictly for a true crimson/scarlet red; never tag pink as Red.",
  shape:
    "Square = flat straight tip; Oval = rounded tip; Almond = tapered to a soft rounded " +
    "point; Stiletto = tapered to a sharp point; Coffin = tapered with a flat squared-off tip.",
  length: "relative to the fingertip: Short (at/below tip), Medium, or Long (well past the tip).",
  detail:
    "decorations on the nails: Rhinestones (gems), Charms (3D metal/flower pieces), " +
    "3D flowers, Foil/glitter, Line art (painted lines), or None.",
};

const PROMPT =
  "You are tagging a nail-design photo for a salon gallery. First, in the " +
  "`observations` field, briefly describe the actual nails: their polish colours, " +
  "shape, length, and any decorations. Then choose the single best value for each " +
  "attribute from its allowed list, based strictly on what you see (not the skin or " +
  "background). If ambiguous, pick the closest match. Return JSON only.\n\n" +
  "Attributes and allowed values:\n" +
  TAG_GROUPS.map(
    (g) => `- ${g.key} (${g.label}): ${g.values.join(", ")}` + (HINTS[g.key] ? `\n  → ${HINTS[g.key]}` : ""),
  ).join("\n");

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Gemini is not configured." }, { status: 501 });
  }

  let body: { imageUrl?: string; caption?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const imageUrl = body.imageUrl;
  if (!imageUrl) return NextResponse.json({ error: "Missing imageUrl." }, { status: 400 });

  // Fetch the image bytes server-side (IG CDN blocks cross-origin browser reads
  // and needs a browser-like User-Agent).
  let mimeType: string;
  let base64: string;
  try {
    const imgRes = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15_000),
    });
    const ct = imgRes.headers.get("content-type") ?? "image/jpeg";
    if (!imgRes.ok || !ct.startsWith("image/")) {
      return NextResponse.json({ error: "Couldn't fetch the image." }, { status: 502 });
    }
    mimeType = ct.split(";")[0];
    base64 = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
  } catch {
    return NextResponse.json({ error: "Couldn't fetch the image." }, { status: 502 });
  }

  const caption = (body.caption ?? "").slice(0, 500).trim();
  const parts: unknown[] = [
    { text: caption ? `${PROMPT}\n\nPost caption (context only): ${caption}` : PROMPT },
    { inline_data: { mime_type: mimeType, data: base64 } },
  ];

  const payload = JSON.stringify({
    contents: [{ parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0,
    },
  });

  // Gemini occasionally returns 503 (high demand) or 429 — retry a couple times
  // with a short backoff so a transient blip doesn't fall back to random tags.
  let geminiRes: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: payload,
          signal: AbortSignal.timeout(30_000),
        },
      );
    } catch {
      return NextResponse.json({ error: "Gemini request failed." }, { status: 504 });
    }
    if (geminiRes.status !== 503 && geminiRes.status !== 429) break;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
  }
  if (!geminiRes) {
    return NextResponse.json({ error: "Gemini request failed." }, { status: 504 });
  }

  if (!geminiRes.ok) {
    const detail = await geminiRes.text().catch(() => "");
    return NextResponse.json(
      { error: `Gemini error (${geminiRes.status}). ${detail.slice(0, 160)}` },
      { status: 502 },
    );
  }

  const data = (await geminiRes.json().catch(() => null)) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    return NextResponse.json({ error: "Empty response from Gemini." }, { status: 502 });
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Gemini returned non-JSON." }, { status: 502 });
  }

  // Keep only values that are actually in our allowed lists.
  const tags: Record<string, string> = {};
  for (const g of TAG_GROUPS) {
    const v = parsed[g.key];
    if (typeof v === "string" && g.values.includes(v)) tags[g.key] = v;
  }

  return NextResponse.json({ tags });
}
