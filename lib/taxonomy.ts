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

/** Human-readable summary of a filter set (for prompts / debugging). */
export function describeFilters(f: AdvisorFilters): string {
  const parts = Object.entries(f)
    .filter(([, v]) => v && (!Array.isArray(v) || v.length))
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join("/") : v}`);
  return parts.length ? parts.join(", ") : "(chưa có)";
}
