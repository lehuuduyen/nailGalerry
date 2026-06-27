// ─────────────────────────────────────────────────────────────────────────
//  Shared Gemini vision classifier for nail-design photos.
//
//  Given an image URL, it returns one value for each of the 8 tag groups PLUS
//  the richer metadata the design pages + advisor use: accent colours, season,
//  style origin, skin tone, undertone, a short alt text, and a one-paragraph
//  description. Every enum-constrained field is validated against the allowed
//  lists so the model can never produce a value we don't support.
//
//  Used by both POST /api/auto-tag (single) and POST /api/auto-tag/batch
//  (bulk, admin) so the prompt + schema live in exactly one place.
//
//  Env: GEMINI_TAG_API_KEY (or GEMINI_API_KEY). See lib/gemini.ts.
// ─────────────────────────────────────────────────────────────────────────

import { TAG_GROUPS } from "./constants";
import { geminiGenerate, geminiText, tagConfig } from "./gemini";
import { FILTER_ENUMS } from "./taxonomy";
import type { NailTags } from "./types";

/** Everything the classifier can produce for one design. */
export type AutoTags = {
  /** The 8 core tag-group values (style, color, shape, …). */
  tags: Partial<NailTags>;
  /** Secondary accent colours present on the nails. */
  accentColors?: string[];
  season?: string;
  styleOrigin?: string;
  skinTone?: string;
  undertone?: string;
  /** A short, factual alt text for the photo (SEO/accessibility). */
  altText?: string;
  /** A friendly one-paragraph description, like the existing design pages. */
  description?: string;
};

// JSON response schema: `observations` first (a small chain-of-thought boost we
// ignore), then every enum-constrained field, then the free-text SEO fields.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    observations: { type: "STRING" },
    ...Object.fromEntries(TAG_GROUPS.map((g) => [g.key, { type: "STRING", enum: g.values }])),
    accentColors: { type: "ARRAY", items: { type: "STRING", enum: FILTER_ENUMS.accent_colors } },
    season: { type: "STRING", enum: FILTER_ENUMS.season },
    styleOrigin: { type: "STRING", enum: FILTER_ENUMS.style_origin },
    skinTone: { type: "STRING", enum: FILTER_ENUMS.skin_tone },
    undertone: { type: "STRING", enum: FILTER_ENUMS.undertone },
    altText: { type: "STRING" },
    description: { type: "STRING" },
  },
  required: [
    "observations",
    ...TAG_GROUPS.map((g) => g.key),
    "accentColors",
    "season",
    "styleOrigin",
    "skinTone",
    "undertone",
    "altText",
    "description",
  ],
  propertyOrdering: [
    "observations",
    ...TAG_GROUPS.map((g) => g.key),
    "accentColors",
    "season",
    "styleOrigin",
    "skinTone",
    "undertone",
    "altText",
    "description",
  ],
};

// Extra guidance for the values models most often get wrong.
const HINTS: Partial<Record<string, string>> = {
  color:
    "the dominant nail-polish colour. Look only at the painted nail surface — IGNORE " +
    "skin tone, background, and gold/glitter accents. For a French or two-tone look " +
    "(e.g. a pink base with white tips/border), pick the colour that covers most of the " +
    "nail bed (usually Pink, not White). Treat ALL shades of pink — bubblegum, hot pink, " +
    "rose, dusty rose, mauve, magenta — as Pink. Use Pastel only for a very pale washed-out " +
    "tint. Reserve Red strictly for a true crimson/scarlet red; never tag pink as Red. Use " +
    "Multicolor only when 3+ clearly different colours share the set with no single dominant one.",
  shape:
    "Square = flat straight tip; Oval = rounded tip; Almond = tapered to a soft rounded " +
    "point; Stiletto = tapered to a sharp point; Coffin = tapered with a flat squared-off tip.",
  length: "relative to the fingertip: Short (at/below tip), Medium, or Long (well past the tip).",
  detail:
    "decorations on the nails: Rhinestones (gems), Charms (3D metal/flower pieces), " +
    "3D flowers, Foil/glitter, Line art (painted lines), Pearls, Studs, Glitter, or None.",
};

const SEO_GUIDE =
  "\n\nAlso provide:\n" +
  "- accentColors: secondary colours that appear as accents (tips, art, glitter, foil). " +
  "Empty array if the set is a single solid colour.\n" +
  "- season: the season this look fits best.\n" +
  "- styleOrigin: the regional aesthetic it most resembles (Korean = soft/minimal/jelly; " +
  "Japanese = ornate 3D art; Western = bold/classic; Russian = clean dry-manicure precision).\n" +
  "- skinTone & undertone: the skin tone/undertone this colour palette flatters most.\n" +
  "- altText: one factual sentence describing the photo for screen readers (≤140 chars), " +
  "e.g. 'Almond nails with soft pink ombre and gold foil accents'.\n" +
  "- description: a warm, specific 2–3 sentence description for the design page — mention the " +
  "colours, finish, shape, decorations and the vibe/occasion it suits. No hashtags, no emoji.";

const PROMPT =
  "You are tagging a nail-design photo for a salon gallery. First, in the " +
  "`observations` field, briefly describe the actual nails: their polish colours, " +
  "shape, length, and any decorations. Then choose the single best value for each " +
  "attribute from its allowed list, based strictly on what you see (not the skin or " +
  "background). If ambiguous, pick the closest match. Return JSON only.\n\n" +
  "Attributes and allowed values:\n" +
  TAG_GROUPS.map(
    (g) => `- ${g.key} (${g.label}): ${g.values.join(", ")}` + (HINTS[g.key] ? `\n  → ${HINTS[g.key]}` : ""),
  ).join("\n") +
  SEO_GUIDE;

/** Fetch image bytes (IG CDN needs a browser UA). Returns null on failure. */
async function fetchImage(imageUrl: string): Promise<{ mimeType: string; base64: string } | null> {
  try {
    const res = await fetch(imageUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15_000),
    });
    const ct = res.headers.get("content-type") ?? "image/jpeg";
    if (!res.ok || !ct.startsWith("image/")) return null;
    return { mimeType: ct.split(";")[0], base64: Buffer.from(await res.arrayBuffer()).toString("base64") };
  } catch {
    return null;
  }
}

/** Keep a string only if it's in the allowed enum. */
function pickEnum(v: unknown, allowed: readonly string[]): string | undefined {
  return typeof v === "string" && allowed.includes(v) ? v : undefined;
}

/**
 * Classify one nail photo. Returns the full tag + metadata set, or null if the
 * image couldn't be fetched or Gemini was unavailable / returned non-JSON.
 */
export async function classifyNailImage(input: {
  imageUrl: string;
  caption?: string;
}): Promise<AutoTags | null> {
  const cfg = tagConfig();
  if (!cfg.apiKey) return null;

  const img = await fetchImage(input.imageUrl);
  if (!img) return null;

  const caption = (input.caption ?? "").slice(0, 500).trim();
  const parts: unknown[] = [
    { text: caption ? `${PROMPT}\n\nPost caption (context only): ${caption}` : PROMPT },
    { inline_data: { mime_type: img.mimeType, data: img.base64 } },
  ];

  const text = geminiText(
    await geminiGenerate(
      {
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0,
        },
      },
      cfg,
      30_000,
    ),
  );
  if (!text) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  // Core tag groups — keep only allowed values.
  const tags: Partial<NailTags> = {};
  for (const g of TAG_GROUPS) {
    const v = pickEnum(parsed[g.key], g.values);
    if (v) tags[g.key] = v;
  }

  const accentColors = Array.isArray(parsed.accentColors)
    ? [...new Set(parsed.accentColors.filter((x): x is string => pickEnum(x, FILTER_ENUMS.accent_colors) !== undefined))]
    : undefined;

  const altText = typeof parsed.altText === "string" ? parsed.altText.trim().slice(0, 200) : undefined;
  const description =
    typeof parsed.description === "string" ? parsed.description.trim().slice(0, 600) : undefined;

  return {
    tags,
    accentColors: accentColors && accentColors.length ? accentColors : undefined,
    season: pickEnum(parsed.season, FILTER_ENUMS.season),
    styleOrigin: pickEnum(parsed.styleOrigin, FILTER_ENUMS.style_origin),
    skinTone: pickEnum(parsed.skinTone, FILTER_ENUMS.skin_tone),
    undertone: pickEnum(parsed.undertone, FILTER_ENUMS.undertone),
    altText: altText || undefined,
    description: description || undefined,
  };
}
