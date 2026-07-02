import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import {
  clearAdvisorSession,
  getAdvisorSession,
  getDesignsByIds,
  isDbConfigured,
  queryDesigns,
  saveAdvisorSession,
  type AdvisorTurn,
} from "@/lib/db";
import { chatConfig, geminiGenerate, geminiText } from "@/lib/gemini";
import {
  describeFilters,
  extractFiltersFromText,
  FILTER_ENUMS,
  hasMinimum,
  mergeFilters,
  validateFilters,
  type AdvisorFilters,
  type FilterField,
} from "@/lib/taxonomy";
import type { Nail } from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
//  AI Advisor — a Vietnamese chat that turns what the user says into a set of
//  catalog FILTERS (via Gemini), then shows REAL designs from Neon. Gemini only
//  picks enum values + writes a short reply; it never invents designs.
//
//  Session state lives in Neon (advisor_sessions), keyed by the signed-in user
//  or a guest cookie — so a refresh restores the whole conversation.
//
//    GET     -> { turns:[{role,text,designs}], filters, username }
//    POST {message} -> { reply, filters, designs, relaxed, hasMinimum }
//    DELETE  -> { ok }   (reset the session)
// ─────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

const ADV_COOKIE = "naillib_advisor_sid";
const MAX_TURNS = 40;
const GRID_LIMIT = 16;

type Session = { key: string; userId: string | null; username?: string };

async function resolveSession(): Promise<Session> {
  const user = await currentUser();
  if (user) return { key: `u:${user.id}`, userId: user.id, username: user.username };
  const store = await cookies();
  let sid = store.get(ADV_COOKIE)?.value;
  if (!sid) {
    sid = crypto.randomUUID();
    store.set(ADV_COOKIE, sid, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 180,
    });
  }
  return { key: `g:${sid}`, userId: null };
}

// ── Gemini: merge filters + write a Vietnamese reply ────────────────────────

const FILTER_PROPS = Object.fromEntries(
  Object.entries(FILTER_ENUMS).map(([k, vals]) =>
    k === "accent_colors"
      ? [k, { type: "ARRAY", items: { type: "STRING", enum: vals } }]
      : [k, { type: "STRING", enum: vals }],
  ),
);

const LANGS = ["en", "vi", "es"] as const;
type Lang = (typeof LANGS)[number];

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    reply: { type: "STRING" },
    lang: { type: "STRING", enum: LANGS },
    filters: { type: "OBJECT", properties: FILTER_PROPS },
  },
  required: ["reply", "lang"],
};

/** Best-effort language guess for fallbacks (when Gemini doesn't tell us). */
function detectLang(text: string): Lang {
  // Vietnamese-only letters (ă â đ ê ô ơ ư + tone marks).
  if (/[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i.test(text)) {
    return "vi";
  }
  if (/[ñ¿¡]/i.test(text)) return "es";
  return "en"; // priority default
}

// Localized system phrases (the conversational `reply` itself comes from Gemini).
const FALLBACK: Record<Lang, string> = {
  en: "Sorry, I didn't quite catch that — could you say it again? 💕",
  vi: "Mình chưa nghe rõ ý bạn, nói lại giúp mình một chút nha 💕",
  es: "Perdona, no te entendí bien, ¿me lo repites? 💕",
};
const NOTE_NO_MATCH: Record<Lang, string> = {
  en: "I couldn't find an exact match — try different criteria 🥲",
  vi: "Hiện mình chưa tìm thấy mẫu nào khớp, bạn thử đổi tiêu chí khác nha 🥲",
  es: "No encontré una coincidencia exacta, prueba con otros criterios 🥲",
};
const NOTE_RELAXED: Record<Lang, string> = {
  en: "I couldn't find an exact match, so here are some close ones!",
  vi: "Chưa có mẫu đúng y vậy nên mình gợi ý mấy mẫu gần giống nha!",
  es: "No encontré una coincidencia exacta, ¡aquí tienes algunas parecidas!",
};
// Positive lead-in used when we can show a grid but Gemini itself didn't give us
// a usable reply (e.g. it was rate-limited) — so we never pair real results with
// a confused "I didn't catch that".
const NOTE_HERE: Record<Lang, string> = {
  en: "Here are some designs you might love! 💕",
  vi: "Đây là vài mẫu bạn có thể thích nha! 💕",
  es: "¡Aquí tienes algunos diseños que te pueden encantar! 💕",
};

const SYSTEM =
  "You are a friendly, warm personal nail stylist.\n\n" +
  "LANGUAGE — TOP PRIORITY: Detect the language of the user's LATEST message and write 'reply' " +
  "ONLY in that exact same language. If the user writes in English, reply in English; Vietnamese → " +
  "Vietnamese; Spanish → Spanish. If the language is unclear, default to English. NEVER reply in a " +
  "language the user did not use (e.g. do NOT reply in Vietnamese to an English message), and ignore " +
  "the language of the user's display name. Set 'lang' to the code you used ('en' | 'vi' | 'es').\n\n" +
  "TASK:\n" +
  "1) Update the design filters from what the user just said: MERGE with the current filters; do NOT " +
  "drop existing tags unless the user clearly changes their mind. ONLY use values from the provided " +
  "enum lists — never invent a value.\n" +
  "IMPORTANT: only set a tag when the user EXPLICITLY mentions it. Never guess or add tags the user " +
  "didn't say. Do NOT set style, technique, mood, season, style_origin, skin_tone, or undertone unless " +
  "the user uses a word that clearly refers to it. For a bare colour like \"red\", set ONLY color=Red " +
  "and nothing else. Example: user says \"red\" → filters {\"color\":\"Red\"} (do NOT also add style, " +
  "technique, undertone, etc.). If nothing maps, return empty filters and keep the current ones.\n" +
  "Mapping (works in any language): a colour like red/pink/black/nude → color; the user's skin being " +
  "fair/light/tan/deep → skin_tone; short/medium/long → length; square/oval/almond/stiletto/coffin → " +
  "shape; 'Korean style' → style_origin=Korean; glitter/shimmer → detail=Foil/glitter; rhinestones/" +
  "gems → detail=Rhinestones; party/wedding/office/everyday → occasion.\n" +
  "2) Write 'reply': 1–2 short, warm sentences reacting to what the user said (e.g. \"Sure, switching " +
  "to short nails!\"). Do NOT describe specific nail designs (the system picks real photos from the " +
  "catalog). No robotic tone.\n" +
  "We need at least 'occasion' and one of 'color' or 'skin_tone' before showing designs. If something " +
  "is missing, gently ask for the missing piece (one question at a time). Once we have them, react and " +
  "invite further tweaks. Return JSON matching the schema, no markdown.";

const ENUM_HINT = Object.entries(FILTER_ENUMS)
  .map(([k, v]) => `${k}: [${v.join(", ")}]`)
  .join("\n");

async function askGemini(
  current: AdvisorFilters,
  message: string,
  username?: string,
): Promise<{ filters: AdvisorFilters; reply: string; lang: Lang; ok: boolean }> {
  const guessed = detectLang(message);
  const langName = { en: "English", vi: "Vietnamese", es: "Spanish" }[guessed];
  const prompt =
    (username ? `User display name (ignore its language): ${username}.\n` : "") +
    `Current filters: ${describeFilters(current)}\n` +
    `Allowed values per tag:\n${ENUM_HINT}\n\n` +
    `The user's latest message looks like ${langName} — reply in ${langName} unless it is ` +
    `clearly another language.\n` +
    `The user just said: "${message}"`;

  const text = geminiText(
    await geminiGenerate(
      {
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.2,
        },
      },
      chatConfig(),
      25_000,
      false, // advisor: only gemini-2.5-flash — no fallback to a weaker model on quota
    ),
  );

  if (text) {
    try {
      // Strip a stray ```json fence if the model adds one.
      const clean = text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(clean);
      const lang: Lang = LANGS.includes(parsed.lang) ? parsed.lang : detectLang(message);
      const reply =
        typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : FALLBACK[lang];
      return { filters: validateFilters(parsed.filters), reply, lang, ok: true };
    } catch {
      /* malformed JSON — fall back below */
    }
  }
  // Gemini unavailable (e.g. quota/429) or unparseable — keep filters, ask again
  // in the user's (best-guess) language.
  const lang = detectLang(message);
  return { filters: {}, reply: FALLBACK[lang], lang, ok: false };
}

/**
 * Drop the soft fields Gemini most often fabricates (skin_tone, undertone,
 * season) unless THIS message gives textual evidence for them — so a bare
 * "red" can't silently add "undertone: Warm" and poison the query. Only prunes
 * the current turn's inferences; values the user set earlier stay in `current`.
 */
function pruneFabricated(f: AdvisorFilters, message: string): AdvisorFilters {
  const out = { ...f };
  if (!/\b(skin|undertone|complexion|tone)\b/i.test(message)) {
    delete out.skin_tone;
    delete out.undertone;
  }
  if (!/\b(spring|summer|fall|autumn|winter|holiday|christmas|beach|season)\b/i.test(message)) {
    delete out.season;
  }
  return out;
}

/** Be honest about result coverage in the reply, in the user's language. */
function composeReply(
  reply: string,
  ready: boolean,
  designs: Nail[],
  dropped: FilterField[],
  lang: Lang,
): string {
  if (!ready) return reply;
  if (designs.length === 0) return `${reply} ${NOTE_NO_MATCH[lang]}`;
  if (dropped.length) return `${reply} ${NOTE_RELAXED[lang]}`;
  return reply;
}

// ── Handlers ────────────────────────────────────────────────────────────────

export async function GET() {
  if (!isDbConfigured()) return NextResponse.json({ turns: [], filters: {}, username: null });
  const { key, username } = await resolveSession();
  const sess = await getAdvisorSession(key);
  if (!sess) return NextResponse.json({ turns: [], filters: {}, username: username ?? null });

  // Resolve the real designs each grid pinned, in one batch.
  const ids = [...new Set(sess.turns.flatMap((t) => t.gridDesignIds ?? []))];
  const byId = new Map((await getDesignsByIds(ids)).map((d) => [d.id, d]));
  const turns = sess.turns.map((t) => ({
    role: t.role,
    text: t.text,
    designs: (t.gridDesignIds ?? []).map((id) => byId.get(id)).filter(Boolean),
  }));
  return NextResponse.json({ turns, filters: sess.filters, username: username ?? null });
}

export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Advisor is not available right now." }, { status: 501 });
  }
  const { key, userId, username } = await resolveSession();

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const message = (body.message ?? "").trim();
  if (!message) return NextResponse.json({ error: "Missing message." }, { status: 400 });

  const sess = await getAdvisorSession(key);
  const current = validateFilters(sess?.filters ?? {});
  const turns: AdvisorTurn[] = sess?.turns ?? [];

  const ai = await askGemini(current, message, username);
  // Deterministic backstop: capture clear mentions ("red", "party") straight
  // from the text so a value is never lost when the model omits it from JSON.
  // Direct mentions win over the model's structured filters.
  const keyworded = extractFiltersFromText(message);
  const aiClean = pruneFabricated(ai.filters, message);
  const merged = mergeFilters(current, { ...aiClean, ...keyworded });

  let designs: Nail[] = [];
  let dropped: FilterField[] = [];
  const ready = hasMinimum(merged);
  if (ready) {
    const r = await queryDesigns(merged, GRID_LIMIT);
    designs = r.items;
    dropped = r.dropped;
  }

  // If the model didn't give us a usable reply but the keyword backstop still
  // got us to a grid, lead with a positive line instead of the confused fallback.
  const base = !ai.ok && ready && designs.length > 0 ? NOTE_HERE[ai.lang] : ai.reply;
  const reply = composeReply(base, ready, designs, dropped, ai.lang);
  const nextTurns: AdvisorTurn[] = [
    ...turns,
    { role: "user" as const, text: message },
    { role: "bot" as const, text: reply, gridDesignIds: designs.map((d) => d.id) },
  ].slice(-MAX_TURNS);
  await saveAdvisorSession(key, userId, merged, nextTurns);

  return NextResponse.json({ reply, filters: merged, designs, relaxed: dropped.length > 0, hasMinimum: ready });
}

export async function DELETE() {
  const { key } = await resolveSession();
  if (isDbConfigured()) await clearAdvisorSession(key).catch(() => {});
  return NextResponse.json({ ok: true });
}
