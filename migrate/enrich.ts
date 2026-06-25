import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { closePool, pool } from "./db";
import { ACCENT_COLOR, ENUMS, isValid, type EnumField } from "./taxonomy";

// ─────────────────────────────────────────────────────────────────────────
//  enrich.ts — fill missing filter tags + SEO fields with Gemini Vision.
//
//  - Reads the R2 image + the design's existing tags, asks gemini-2.5-flash for
//    the missing attributes as JSON, constrained to taxonomy enums (free text
//    only for description/alt_text). Unsure → null; never fabricate.
//  - Idempotent: only writes columns that are currently NULL/empty (COALESCE),
//    so re-running never overwrites existing values.
//  - Batched (10), with retry + progress logs. Images that can't be read or
//    rows Gemini can't process are logged to migrate/enrich-failed.json and
//    skipped — one failure never aborts the run.
//
//  Env: GEMINI_API_KEY (falls back to GEMINI_TAG_API_KEY), GEMINI_MODEL.
//  Run: npx tsx migrate/enrich.ts
// ─────────────────────────────────────────────────────────────────────────

const API_KEY = process.env.GEMINI_API_KEY || process.env.GEMINI_TAG_API_KEY || "";
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const BATCH = 10;
const MAX_RETRIES = 2;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// Enum fields Gemini may fill (only those that can legitimately be missing).
const FILL_ENUM_FIELDS: EnumField[] = [
  "season",
  "occasion",
  "mood",
  "style_origin",
  "skin_tone",
  "undertone",
];

type DesignRow = {
  id: string;
  title: string | null;
  style: string | null;
  color: string | null;
  shape: string | null;
  length: string | null;
  occasion: string | null;
  season: string | null;
  mood: string | null;
  style_origin: string | null;
  technique: string | null;
  detail: string | null;
  skin_tone: string | null;
  undertone: string | null;
  accent_colors: string[] | null;
  description: string | null;
  alt_text: string | null;
  slug: string | null;
  image_url: string;
  caption: string | null;
};

type Enriched = {
  season?: string | null;
  occasion?: string | null;
  mood?: string | null;
  style_origin?: string | null;
  skin_tone?: string | null;
  undertone?: string | null;
  accent_colors?: string[];
  description?: string | null;
  alt_text?: string | null;
};

const failures: { id: string; error: string }[] = [];

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

/** Build a unique-ish slug from the design's main tags + a stable id suffix. */
function buildSlug(row: DesignRow, e: Enriched): string {
  const parts = [
    row.color,
    row.shape,
    e.season ?? row.season ?? e.occasion ?? row.occasion,
    row.style,
    row.technique,
  ].filter(Boolean) as string[];
  const tail = row.id.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toLowerCase() || "x";
  const base = slugify(parts.join(" ") || row.title || "nail-design");
  return `${base}-nails-${tail}`;
}

function buildPrompt(row: DesignRow): string {
  const known = [
    ["style", row.style],
    ["color", row.color],
    ["shape", row.shape],
    ["length", row.length],
    ["technique", row.technique],
    ["detail", row.detail],
    ["occasion", row.occasion],
    ["mood", row.mood],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  const list = (f: EnumField) => (ENUMS[f] as readonly string[]).join(", ");

  return (
    "You are a professional nail-design cataloguer writing SEO metadata for a salon gallery. " +
    "Look ONLY at the actual nails in the image (and the hand/skin if clearly visible). " +
    "Return a JSON object with these keys. For every enum field choose EXACTLY one value from " +
    "its allowed list, based strictly on what you see. If you cannot tell, return null — never guess.\n\n" +
    `Known tags (context, may be partial): ${known || "(none)"}.\n` +
    (row.caption ? `Post caption (context only): ${row.caption.slice(0, 300)}\n` : "") +
    "\nFields:\n" +
    `- season: one of [${list("season")}] — the season/occasion vibe of the look, or null.\n` +
    `- occasion: one of [${list("occasion")}] — the event it suits, or null.\n` +
    `- mood: one of [${list("mood")}] — overall aesthetic/emotion, or null.\n` +
    `- style_origin: one of [${list("style_origin")}] — only if the look clearly follows that culture's nail style, else null.\n` +
    `- skin_tone: one of [${list("skin_tone")}] — the model's hand skin tone IF a hand is visible, else null.\n` +
    `- undertone: one of [${list("undertone")}] — skin undertone IF visible, else null.\n` +
    `- accent_colors: array (0-4) from [${ACCENT_COLOR.join(", ")}] — secondary/accent colours on the nails (exclude the main colour). Empty array if none.\n` +
    "- description: a UNIQUE, natural 100-180 word English paragraph describing THIS specific design " +
    "(colours, finish, shape, vibe, who it suits). Vary wording between designs; no boilerplate, no marketing fluff.\n" +
    "- alt_text: one concise sentence (max ~125 chars) describing the image for accessibility/SEO.\n\n" +
    "Return ONLY the JSON object."
  );
}

async function fetchImageBase64(url: string): Promise<{ mime: string; data: string }> {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20_000) });
  const ct = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
  if (!res.ok || !ct.startsWith("image/")) throw new Error(`image fetch ${res.status} (${ct})`);
  const buf = Buffer.from(await res.arrayBuffer());
  return { mime: ct, data: buf.toString("base64") };
}

async function callGemini(prompt: string, img: { mime: string; data: string }): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const body = {
    contents: [
      { parts: [{ text: prompt }, { inline_data: { mime_type: img.mime, data: img.data } }] },
    ],
    generationConfig: { responseMimeType: "application/json", temperature: 0.6 },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const err = new Error(`gemini ${res.status}: ${detail.slice(0, 160)}`);
    (err as { status?: number }).status = res.status;
    throw err;
  }
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text).join("") ?? "";
  if (!text) throw new Error("gemini returned empty");
  return text;
}

/** Keep only enum-valid values; invalid/empty → undefined (won't be written). */
function sanitize(raw: Record<string, unknown>): Enriched {
  const out: Enriched = {};
  for (const f of FILL_ENUM_FIELDS) {
    const v = raw[f];
    if (typeof v === "string" && isValid(f, v)) (out as Record<string, unknown>)[f] = v;
  }
  if (Array.isArray(raw.accent_colors)) {
    const accents = raw.accent_colors.filter(
      (c): c is string => typeof c === "string" && (ACCENT_COLOR as readonly string[]).includes(c),
    );
    out.accent_colors = [...new Set(accents)];
  }
  if (typeof raw.description === "string" && raw.description.trim().length > 40) {
    out.description = raw.description.trim();
  }
  if (typeof raw.alt_text === "string" && raw.alt_text.trim()) {
    out.alt_text = raw.alt_text.trim().slice(0, 160);
  }
  return out;
}

async function enrichOne(row: DesignRow): Promise<"ok" | "failed"> {
  const img = await fetchImageBase64(row.image_url);
  const prompt = buildPrompt(row);

  let text = "";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      text = await callGemini(prompt, img);
      break;
    } catch (err) {
      const status = (err as { status?: number }).status;
      // Don't retry auth/quota errors — they won't fix themselves.
      if (status === 401 || status === 403 || status === 429 || attempt === MAX_RETRIES) throw err;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("non-JSON from gemini");
  }
  const e = sanitize(parsed);
  const slug = row.slug ?? buildSlug(row, e);

  // Only fill what's currently empty (idempotent). accent_colors replaced only
  // when empty/null. slug set only when null.
  await pool.query(
    `UPDATE designs SET
       season        = COALESCE(season, $2),
       occasion      = COALESCE(occasion, $3),
       mood          = COALESCE(mood, $4),
       style_origin  = COALESCE(style_origin, $5),
       skin_tone     = COALESCE(skin_tone, $6),
       undertone     = COALESCE(undertone, $7),
       accent_colors = CASE WHEN accent_colors IS NULL OR accent_colors = '{}'
                            THEN $8::text[] ELSE accent_colors END,
       description   = COALESCE(description, $9),
       alt_text      = COALESCE(alt_text, $10),
       slug          = COALESCE(slug, $11)
     WHERE id = $1`,
    [
      row.id,
      e.season ?? null,
      e.occasion ?? null,
      e.mood ?? null,
      e.style_origin ?? null,
      e.skin_tone ?? null,
      e.undertone ?? null,
      e.accent_colors ?? [],
      e.description ?? null,
      e.alt_text ?? null,
      slug,
    ],
  );
  return "ok";
}

async function main() {
  if (!API_KEY) {
    console.error("No Gemini key (set GEMINI_API_KEY or GEMINI_TAG_API_KEY). Aborting.");
    process.exitCode = 1;
    return;
  }

  // Rows missing at least one enrichable field.
  const rows = (await pool.query(`
    SELECT * FROM designs
    WHERE description IS NULL OR alt_text IS NULL OR slug IS NULL
       OR skin_tone IS NULL OR undertone IS NULL OR season IS NULL
       OR style_origin IS NULL OR accent_colors IS NULL OR accent_colors = '{}'
    ORDER BY created_at DESC NULLS LAST, id
  `)) as unknown as { rows: DesignRow[] };
  const pending = rows.rows;
  console.log(`Designs to enrich: ${pending.length} (model ${MODEL})`);

  let ok = 0;
  let consecutiveAuthFails = 0;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (row) => {
        try {
          await enrichOne(row);
          ok++;
          consecutiveAuthFails = 0;
          process.stdout.write(".");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          failures.push({ id: row.id, error: msg });
          if (/gemini (401|403|429)/.test(msg)) consecutiveAuthFails++;
          process.stdout.write("x");
        }
      }),
    );
    console.log(`  ${Math.min(i + BATCH, pending.length)}/${pending.length}`);
    // Bail early if the key is clearly unusable (depleted / invalid).
    if (consecutiveAuthFails >= 5) {
      console.error("\nToo many auth/quota errors from Gemini — stopping early. Check the key/credits.");
      break;
    }
    if (i + BATCH < pending.length) await new Promise((r) => setTimeout(r, 1500));
  }

  writeFileSync(resolve(process.cwd(), "migrate/enrich-failed.json"), JSON.stringify(failures, null, 2));
  console.log(`\n──────── Enrich summary ────────`);
  console.log(`  enriched ok: ${ok}`);
  console.log(`  failed:      ${failures.length} (see migrate/enrich-failed.json)`);
}

main()
  .catch((err) => {
    console.error("enrich failed:", err);
    process.exitCode = 1;
  })
  .finally(closePool);
