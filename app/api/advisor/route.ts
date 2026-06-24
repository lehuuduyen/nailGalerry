import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/advisor  { name, age, element, elementVi, favoriteColor,
//                       occasion, recommendedColors, picks }  ->  { reply }
//
//  Writes a warm, personalised nail-stylist reply with Google Gemini. The
//  feng-shui scoring still happens client-side; this just turns the result
//  into natural language. Falls back to a simple template if Gemini is off.
// ─────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

type Pick = { title?: string; color?: string; style?: string; shape?: string };

type Body = {
  name?: string;
  age?: number;
  element?: string;
  elementVi?: string;
  favoriteColor?: string;
  occasion?: string;
  recommendedColors?: string[];
  picks?: Pick[];
};

function fallbackReply(b: Body): string {
  const name = b.name?.trim() || "there";
  const colors = (b.recommendedColors ?? []).join(", ");
  return (
    `Lovely to meet you, ${name}! Your ${b.element ?? ""} element pairs beautifully with ` +
    `${colors || "neutral"} tones. I’ve picked a few designs for your ${b.occasion ?? ""} ` +
    `occasion and favourite colour — take a look below!`
  );
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ reply: fallbackReply(body) });

  const picks = (body.picks ?? [])
    .slice(0, 4)
    .map((p) => `“${p.title}” (${[p.color, p.style, p.shape].filter(Boolean).join(", ")})`)
    .join("; ");

  const prompt =
    "You are a warm, tasteful personal nail stylist. Write a SHORT reply (2-3 sentences) " +
    "in English, friendly and personalised — address the client by name and say 'I'. " +
    "Using their details and Chinese five-element (ngũ hành) feng shui, briefly explain why " +
    "the picked designs suit them, then encourage them to look at the suggestions below. " +
    "No markdown, at most one emoji.\n\n" +
    `Name: ${body.name ?? ""}\n` +
    `Age: ${body.age ?? ""}\n` +
    `Element: ${body.element ?? ""}${body.elementVi ? ` (${body.elementVi})` : ""}\n` +
    `Favourite colour: ${body.favoriteColor ?? ""}\n` +
    `Occasion: ${body.occasion ?? ""}\n` +
    `Harmonious colours: ${(body.recommendedColors ?? []).join(", ")}\n` +
    `Picked designs: ${picks || "(none)"}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.85 },
        }),
        signal: AbortSignal.timeout(25_000),
      },
    );
    if (!res.ok) return NextResponse.json({ reply: fallbackReply(body) });
    const data = (await res.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    } | null;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return NextResponse.json({ reply: text || fallbackReply(body) });
  } catch {
    return NextResponse.json({ reply: fallbackReply(body) });
  }
}
