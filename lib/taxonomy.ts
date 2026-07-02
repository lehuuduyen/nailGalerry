// ─────────────────────────────────────────────────────────────────────────
//  Closed taxonomy for the AI Advisor's filter tags. Gemini may ONLY pick
//  values from these lists (it never invents tags); the app validates against
//  them before querying Neon. Mirrors the design columns enriched in the DB.
// ─────────────────────────────────────────────────────────────────────────

export const FILTER_ENUMS = {
  occasion: ["Everyday", "Office", "Bridal", "Party", "Lunar New Year", "Summer", "Winter"],
  color: [
    "Pink",
    "Nude",
    "Red",
    "White",
    "Black",
    "Blue",
    "Green",
    "Purple",
    "Yellow",
    "Orange",
    "Brown",
    "Gray",
    "Pastel",
    "Metallic",
    "Multicolor",
  ],
  skin_tone: ["Fair", "Light", "Medium", "Tan", "Deep"],
  undertone: ["Warm", "Cool", "Neutral"],
  season: ["Spring", "Summer", "Fall", "Winter", "Holiday"],
  style: [
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
    "Marble",
    "Abstract",
    "Animal print",
  ],
  style_origin: ["Korean", "Japanese", "Western", "Russian"],
  shape: ["Square", "Oval", "Almond", "Stiletto", "Coffin"],
  length: ["Short", "Medium", "Long"],
  mood: [
    "Minimalist",
    "Luxurious",
    "Cute",
    "Edgy",
    "Vintage",
    "Korean",
    "Romantic",
    "Elegant",
    "Glam",
  ],
  technique: ["Gel", "Regular polish", "Dip powder", "Press-on", "Acrylic", "Airbrush"],
  detail: [
    "Rhinestones",
    "Charms",
    "3D flowers",
    "Foil/glitter",
    "Line art",
    "Pearls",
    "Studs",
    "Glitter",
    "None",
  ],
  accent_colors: [
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
  ],
} as const;

export type FilterField = keyof typeof FILTER_ENUMS;

/** Fields whose value is an array (everything else is a single string). */
export const MULTI_FIELDS: FilterField[] = ["accent_colors"];

export type AdvisorFilters = {
  [K in FilterField]?: K extends "accent_colors" ? string[] : string;
};

/**
 * Order to drop tags when a query returns too few results (least → most
 * important). `occasion` and `color` are kept longest (they're the minimum).
 */
export const RELAX_ORDER: FilterField[] = [
  "detail",
  "technique",
  "undertone",
  "mood",
  "accent_colors",
  "style_origin",
  "season",
  "skin_tone",
  "style",
  "shape",
  "length",
  "color",
  "occasion",
];

/** We need a dip + a colour cue before showing the first grid. */
export function hasMinimum(f: AdvisorFilters): boolean {
  return Boolean(f.occasion && (f.color || f.skin_tone));
}

/** Keep only valid enum values; drop anything Gemini may have invented. */
export function validateFilters(input: unknown): AdvisorFilters {
  const out: AdvisorFilters = {};
  if (!input || typeof input !== "object") return out;
  const obj = input as Record<string, unknown>;
  for (const field of Object.keys(FILTER_ENUMS) as FilterField[]) {
    const allowed = FILTER_ENUMS[field] as readonly string[];
    const v = obj[field];
    if (field === "accent_colors") {
      if (Array.isArray(v)) {
        const arr = [...new Set(v.filter((x): x is string => typeof x === "string" && allowed.includes(x)))];
        if (arr.length) out.accent_colors = arr;
      }
    } else if (typeof v === "string" && allowed.includes(v)) {
      (out as Record<string, string>)[field] = v;
    }
  }
  return out;
}

/** Merge new filters over the current ones (never resets existing keys). */
export function mergeFilters(current: AdvisorFilters, incoming: AdvisorFilters): AdvisorFilters {
  return { ...current, ...incoming };
}

// ── Deterministic keyword backstop ──────────────────────────────────────────
// Gemini sometimes acknowledges a request in its reply ("adding red!") but
// forgets to put the value in the structured `filters` JSON, so the filter is
// silently lost and we never reach the minimum to show designs. To make this
// robust we ALSO scan the raw message for clear, unambiguous mentions and merge
// those in. We only cover high-signal fields (a colour, an occasion, a shape, a
// length, a season, a style origin) — ambiguous English words (e.g. mood/style
// values like "cute" or "solid") are left to Gemini to avoid false positives.

const ESC = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole-"word" match (latin-letter boundaries), case-insensitive. */
function mentions(text: string, phrase: string): boolean {
  return new RegExp(`(?:^|[^a-z])${ESC(phrase.toLowerCase())}(?:$|[^a-z])`, "i").test(text);
}

/** Everyday-language synonyms → canonical occasion value. */
const OCCASION_SYNONYMS: Record<string, string> = {
  party: "Party",
  birthday: "Party",
  club: "Party",
  clubbing: "Party",
  "night out": "Party",
  wedding: "Bridal",
  bridal: "Bridal",
  bride: "Bridal",
  office: "Office",
  work: "Office",
  interview: "Office",
  business: "Office",
  everyday: "Everyday",
  daily: "Everyday",
  casual: "Everyday",
  tet: "Lunar New Year",
  "lunar new year": "Lunar New Year",
  summer: "Summer",
  beach: "Summer",
  winter: "Winter",
  christmas: "Winter",
};

// Note: season ("fall"/"spring") and mood/style values are intentionally
// excluded — they're too common as ordinary words and would false-trigger.
const KEYWORD_FIELDS: FilterField[] = ["color", "shape", "length", "style_origin"];

// Vietnamese/Spanish (and a few English) cues → canonical enum value, per field.
// English enum values are matched directly above; this adds non-English synonyms
// so the deterministic backstop still works for VN/ES input even when the model
// is unavailable. Matched longest-phrase-first (see usage) so "xanh lá" (green)
// wins over "xanh" (blue), "mùa hè" over "hè", etc.
const SYNONYMS: Partial<Record<FilterField, Record<string, string>>> = {
  color: {
    đỏ: "Red", hồng: "Pink", trắng: "White", đen: "Black",
    "xanh lá": "Green", "xanh dương": "Blue", xanh: "Blue",
    nâu: "Brown", vàng: "Yellow", tím: "Purple", cam: "Orange", xám: "Gray",
    rojo: "Red", rosa: "Pink", rosado: "Pink", blanco: "White", negro: "Black",
    azul: "Blue", verde: "Green", "marrón": "Brown", amarillo: "Yellow",
    morado: "Purple", naranja: "Orange", gris: "Gray",
  },
  occasion: {
    "tiệc": "Party", "đám cưới": "Bridal", "cưới": "Bridal", "công sở": "Office",
    "văn phòng": "Office", "hằng ngày": "Everyday", "hàng ngày": "Everyday",
    "tết": "Lunar New Year", "mùa hè": "Summer", "hè": "Summer", "mùa đông": "Winter",
    fiesta: "Party", boda: "Bridal", oficina: "Office", trabajo: "Office",
    diario: "Everyday", verano: "Summer", invierno: "Winter",
  },
  shape: {
    "vuông": "Square", "bầu dục": "Oval", "hạnh nhân": "Almond", "nhọn": "Stiletto",
    "quan tài": "Coffin", cuadrado: "Square", ovalado: "Oval", almendra: "Almond",
  },
  length: {
    "ngắn": "Short", "vừa": "Medium", "trung bình": "Medium", "dài": "Long",
    corto: "Short", medio: "Medium", largo: "Long",
  },
};

/**
 * Pull clear filter mentions straight out of the user's text — a backstop for
 * when the model omits them from its structured output. Returns only what's
 * confidently present; merge it OVER the model's filters so direct mentions win.
 */
export function extractFiltersFromText(text: string): AdvisorFilters {
  const lower = ` ${text.toLowerCase()} `;
  const out: AdvisorFilters = {};

  // Apply VN/ES (and EN) synonyms for a field, longest phrase first so e.g.
  // "xanh lá" beats "xanh". Only sets the field if not already set.
  const applySynonyms = (field: FilterField) => {
    const map = SYNONYMS[field];
    if (!map || (out as Record<string, unknown>)[field]) return;
    for (const syn of Object.keys(map).sort((a, b) => b.length - a.length)) {
      if (mentions(lower, syn)) {
        (out as Record<string, string>)[field] = map[syn];
        return;
      }
    }
  };

  for (const field of KEYWORD_FIELDS) {
    for (const v of FILTER_ENUMS[field]) {
      if (mentions(lower, v) || mentions(lower, v.replace(/-/g, " "))) {
        (out as Record<string, string>)[field] = v;
        break;
      }
    }
    applySynonyms(field);
  }

  // Occasion: enum values first, then English synonyms, then VN/ES synonyms.
  for (const v of FILTER_ENUMS.occasion) {
    if (mentions(lower, v)) {
      out.occasion = v;
      break;
    }
  }
  if (!out.occasion) {
    for (const [syn, val] of Object.entries(OCCASION_SYNONYMS)) {
      if (mentions(lower, syn)) {
        out.occasion = val;
        break;
      }
    }
  }
  applySynonyms("occasion");

  // Accent colours: any extra colours named beyond the dominant one.
  const accents = FILTER_ENUMS.accent_colors.filter(
    (c) => mentions(lower, c) && c !== out.color,
  );
  if (accents.length) out.accent_colors = accents;

  return out;
}

/** Human-readable summary of a filter set (for prompts / debugging). */
export function describeFilters(f: AdvisorFilters): string {
  const parts = Object.entries(f)
    .filter(([, v]) => v && (!Array.isArray(v) || v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("/") : v}`);
  return parts.length ? parts.join(", ") : "(chưa có)";
}
