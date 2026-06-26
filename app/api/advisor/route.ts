import { NextResponse } from "next/server";
import { GROUP_BY_KEY } from "@/lib/constants";
import { chatConfig, geminiGenerate, geminiText } from "@/lib/gemini";

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/advisor  { messages: {role:"user"|"bot", text}[] }
//    ->  { reply, name?, birthYear?, favoriteColor?, occasion?, ready }
//
//  A real multi-turn stylist chat powered by Gemini. The model converses
//  naturally while quietly gathering the four facts the feng-shui matcher
//  needs; when it has them it sets ready=true. Falls back to a tiny scripted
//  flow if Gemini isn't configured.
// ─────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

const COLORS = GROUP_BY_KEY.color.values;
const OCCASIONS = GROUP_BY_KEY.occasion.values;
const LENGTHS = GROUP_BY_KEY.length.values;
const SHAPES = GROUP_BY_KEY.shape.values;
const STYLES = GROUP_BY_KEY.style.values;

type Msg = { role: "user" | "bot"; text: string };

const SYSTEM =
  "You are a warm, witty personal nail stylist chatting with a client to recommend nail " +
  "designs. Talk like a real person: react to what they say, be brief and friendly, one " +
  "short message at a time. Through natural conversation, learn four things: their name, " +
  "birth year (for feng-shui), favourite colour, and the occasion they're planning for. " +
  "Ask for whatever is still missing, conversationally — never list all questions at once. " +
  "When you know all four, set ready=true and write a lovely closing line saying you've " +
  "picked some designs for them below. If the client later refines what they want (e.g. " +
  "shorter nails, a different shape or style), acknowledge it, keep ready=true, and capture " +
  "the refinement so the picks can update. Always reply in English.\n\n" +
  "Return JSON with: reply (your next message to the client), and any facts gathered so far " +
  `(name; birthYear as a 4-digit number; favoriteColor — map to one of [${COLORS.join(", ")}]; ` +
  `occasion — map to one of [${OCCASIONS.join(", ")}]; ` +
  `and ONLY when the client mentions them: length — one of [${LENGTHS.join(", ")}]; ` +
  `shape — one of [${SHAPES.join(", ")}]; style — one of [${STYLES.join(", ")}]); ` +
  "and ready (true only once the first four are known).";

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    name: { type: "STRING" },
    birthYear: { type: "INTEGER" },
    favoriteColor: { type: "STRING", enum: COLORS },
    occasion: { type: "STRING", enum: OCCASIONS },
    length: { type: "STRING", enum: LENGTHS },
    shape: { type: "STRING", enum: SHAPES },
    style: { type: "STRING", enum: STYLES },
    ready: { type: "BOOLEAN" },
  },
  required: ["reply", "ready"],
  propertyOrdering: [
    "reply",
    "name",
    "birthYear",
    "favoriteColor",
    "occasion",
    "length",
    "shape",
    "style",
    "ready",
  ],
};

export async function POST(req: Request) {
  let body: { messages?: Msg[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];

  const cfg = chatConfig();
  if (!cfg.apiKey) {
    return NextResponse.json({
      reply: "Hi! I’m your personal nail stylist 💕 What should I call you?",
      ready: false,
    });
  }

  // Keep only turns with real text (guards against any marker/empty messages),
  // then drop leading bot/greeting turns (Gemini wants a user turn first) and
  // map bot->model.
  const turns = messages.filter((m) => typeof m.text === "string" && m.text.trim().length > 0);
  while (turns.length && turns[0].role === "bot") turns.shift();
  const contents = turns.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.text }],
  }));

  // Falls back through the model chain (e.g. to gemini-2.5-flash) on quota.
  const text = geminiText(
    await geminiGenerate(
      {
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.85,
        },
      },
      cfg,
    ),
  );

  if (text) {
    try {
      const parsed = JSON.parse(text);
      return NextResponse.json({
        reply: typeof parsed.reply === "string" ? parsed.reply : "Tell me a little more!",
        name: parsed.name,
        birthYear: parsed.birthYear,
        favoriteColor: COLORS.includes(parsed.favoriteColor) ? parsed.favoriteColor : undefined,
        occasion: OCCASIONS.includes(parsed.occasion) ? parsed.occasion : undefined,
        length: LENGTHS.includes(parsed.length) ? parsed.length : undefined,
        shape: SHAPES.includes(parsed.shape) ? parsed.shape : undefined,
        style: STYLES.includes(parsed.style) ? parsed.style : undefined,
        ready: Boolean(parsed.ready),
      });
    } catch {
      /* fall through to canned reply */
    }
  }

  return NextResponse.json({
    reply: "Sorry, I lost my train of thought! Could you say that again?",
    ready: false,
  });
}
