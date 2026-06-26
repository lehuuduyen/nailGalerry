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
  required: ["reply"],
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

const SYSTEM =
  "NGÔN NGỮ: Trả lời bằng ĐÚNG ngôn ngữ khách đang dùng ở câu mới nhất. Hỗ trợ: English, " +
  "Tiếng Việt, Español. Nếu không chắc chắn, mặc định dùng English (ưu tiên: English > Tiếng " +
  "Việt > Español). Đặt trường 'lang' = mã ngôn ngữ bạn dùng để trả lời ('en' | 'vi' | 'es').\n\n" +
  "Bạn là chuyên viên tư vấn nail thân thiện, nói chuyện tự nhiên và ấm áp. Nhiệm vụ:\n" +
  "1) Cập nhật bộ lọc (filters) từ câu khách vừa nói: MERGE với bộ lọc hiện tại, KHÔNG xoá " +
  "tiêu chí cũ trừ khi khách đổi ý rõ ràng. CHỈ dùng giá trị có trong danh sách enum cho sẵn.\n" +
  "QUY TẮC QUAN TRỌNG: chỉ đặt giá trị cho một tiêu chí khi khách NÓI RÕ điều đó trong câu. " +
  "TUYỆT ĐỐI KHÔNG suy đoán hay tự thêm tiêu chí khách chưa nhắc — đặc biệt skin_tone và " +
  "undertone CHỈ đặt khi khách nói về da/tông da của họ, KHÔNG bao giờ tự đoán. Nếu câu khách " +
  "không khớp tiêu chí nào, giữ nguyên filters.\n" +
  "Gợi ý ánh xạ: 'màu đỏ/hồng/đen/nude…' → color; 'da trắng/sáng/ngăm/đen' → skin_tone; " +
  "'móng ngắn/vừa/dài' → length; 'dáng vuông/oval/almond/nhọn/coffin' → shape; 'kiểu Hàn' → " +
  "style_origin=Korean; 'lấp lánh/nhũ/glitter' → detail=Foil/glitter; 'đính đá' → " +
  "detail=Rhinestones; 'đi tiệc/cưới/đi làm/hằng ngày' → occasion.\n" +
  '2) Viết "reply": 1–2 câu ngắn, ấm áp, phản hồi đúng điều khách vừa nói (vd "Ok đổi qua dáng ngắn nha!"). ' +
  "KHÔNG mô tả mẫu nail cụ thể (mẫu do hệ thống chọn từ kho ảnh thật). KHÔNG dùng giọng máy móc.\n" +
  'Cần biết tối thiểu "occasion" (dịp) và một trong "color" (màu thích) hoặc "skin_tone" (tông da) ' +
  "trước khi xem mẫu. Nếu còn thiếu, reply hỏi nhẹ đúng phần còn thiếu (mỗi lần 1 câu). " +
  "Nếu đã đủ, reply phản hồi rồi mời khách tinh chỉnh thêm. Trả về JSON đúng schema, không markdown.";

const ENUM_HINT = Object.entries(FILTER_ENUMS)
  .map(([k, v]) => `${k}: [${v.join(", ")}]`)
  .join("\n");

async function askGemini(
  current: AdvisorFilters,
  message: string,
  username?: string,
): Promise<{ filters: AdvisorFilters; reply: string; lang: Lang }> {
  const prompt =
    (username ? `Tên khách: ${username}.\n` : "") +
    `Bộ lọc hiện tại: ${describeFilters(current)}\n` +
    `Giá trị hợp lệ cho từng tiêu chí:\n${ENUM_HINT}\n\n` +
    `Khách vừa nói: "${message}"`;

  const text = geminiText(
    await geminiGenerate(
      {
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.3,
        },
      },
      chatConfig(),
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
      return { filters: validateFilters(parsed.filters), reply, lang };
    } catch {
      /* malformed JSON — fall back below */
    }
  }
  // Gemini unavailable (e.g. quota/429) or unparseable — keep filters, ask again
  // in the user's (best-guess) language.
  const lang = detectLang(message);
  return { filters: {}, reply: FALLBACK[lang], lang };
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
  const merged = mergeFilters(current, ai.filters);

  let designs: Nail[] = [];
  let dropped: FilterField[] = [];
  const ready = hasMinimum(merged);
  if (ready) {
    const r = await queryDesigns(merged, GRID_LIMIT);
    designs = r.items;
    dropped = r.dropped;
  }

  const reply = composeReply(ai.reply, ready, designs, dropped, ai.lang);
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
