// ─────────────────────────────────────────────────────────────────────────
//  taxonomy.ts — the CLOSED set of valid values for every filter tag.
//
//  Gemini enrichment must only pick from these (free text is allowed for
//  description / alt_text only). verify.ts flags any stored value outside
//  these sets. Unchanged tags reuse the app's existing values (lib/constants);
//  `season` and `style_origin` are split out of the overloaded `occasion`
//  and `mood` tags.
// ─────────────────────────────────────────────────────────────────────────

// — Existing tags (kept identical to the app's lib/constants.ts) —
export const STYLE = [
  "French",
  "Cat-eye",
  "Ombre",
  "Chrome",
  "Hand-painted",
  "Floral",
  "Glitter",
  "Solid",
  "Aurora",
  "Pattern",
] as const;

export const COLOR = ["Pink", "Nude", "Red", "White", "Black", "Blue", "Pastel", "Metallic"] as const;

// Accent colours use a richer palette than the primary `color` — nail accents
// are often gold/silver/green/etc. that the 8-colour primary list can't cover.
export const ACCENT_COLOR = [
  "Pink",
  "Nude",
  "Red",
  "White",
  "Black",
  "Blue",
  "Pastel",
  "Metallic",
  "Gold",
  "Silver",
  "Green",
  "Purple",
  "Orange",
  "Yellow",
  "Brown",
] as const;

export const SHAPE = ["Square", "Oval", "Almond", "Stiletto", "Coffin"] as const;

export const LENGTH = ["Short", "Medium", "Long"] as const;

export const TECHNIQUE = [
  "Gel",
  "Regular polish",
  "Dip powder",
  "Press-on",
  "Acrylic",
  "Airbrush",
] as const;

export const DETAIL = [
  "Rhinestones",
  "Charms",
  "3D flowers",
  "Foil/glitter",
  "Line art",
  "None",
] as const;

// — Split out of the old `occasion` (which mixed events + seasons) —
export const OCCASION = ["Everyday", "Office", "Bridal", "Party", "Lunar New Year"] as const;
export const SEASON = ["Spring", "Summer", "Fall", "Winter", "Holiday"] as const;

// — Split out of the old `mood` (which mixed emotion + cultural origin) —
// Korean was a cultural origin, not a mood; emotion/aesthetic stays in `mood`.
export const MOOD = [
  "Minimalist",
  "Luxurious",
  "Cute",
  "Edgy",
  "Vintage",
  "Romantic",
  "Elegant",
  "Glam",
] as const;
export const STYLE_ORIGIN = ["Korean", "Japanese", "Western", "Russian"] as const;

// — New attributes for the advisor (skin matching) —
export const SKIN_TONE = ["Fair", "Light", "Medium", "Tan", "Deep"] as const;
export const UNDERTONE = ["Warm", "Cool", "Neutral"] as const;

// ── Enrichable fields → their allowed enum (used by enrich prompt + verify) ──
export const ENUMS = {
  style: STYLE,
  color: COLOR,
  shape: SHAPE,
  length: LENGTH,
  technique: TECHNIQUE,
  detail: DETAIL,
  occasion: OCCASION,
  season: SEASON,
  mood: MOOD,
  style_origin: STYLE_ORIGIN,
  skin_tone: SKIN_TONE,
  undertone: UNDERTONE,
} as const;

export type EnumField = keyof typeof ENUMS;

/** True if `value` is allowed for the given enum field. */
export function isValid(field: EnumField, value: string): boolean {
  return (ENUMS[field] as readonly string[]).includes(value);
}

// ── Deterministic normalisation of existing rows (NOT Gemini) ──────────────
// Applied by normalize.ts before enrichment. These are 1:1 reclassifications
// of values that currently sit in the wrong column.

/** old occasion value → { season?, occasion? } after the split. */
export const OCCASION_SPLIT: Record<string, { season?: string; occasion: string | null }> = {
  Summer: { season: "Summer", occasion: null },
  Winter: { season: "Winter", occasion: null },
  Spring: { season: "Spring", occasion: null },
  Fall: { season: "Fall", occasion: null },
  // Real events stay in occasion (season left for Gemini to infer).
  Everyday: { occasion: "Everyday" },
  Office: { occasion: "Office" },
  Bridal: { occasion: "Bridal" },
  Party: { occasion: "Party" },
  "Lunar New Year": { occasion: "Lunar New Year" },
};

/** old mood value → { style_origin?, mood? } after the split. */
export const MOOD_SPLIT: Record<string, { style_origin?: string; mood: string | null }> = {
  // Korean was an origin, not a mood → move it; clear mood for Gemini to fill.
  Korean: { style_origin: "Korean", mood: null },
};
