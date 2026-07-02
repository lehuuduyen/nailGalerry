// ─────────────────────────────────────────────────────────────────────────
//  SEO collection (category) landing pages — /nails/[slug].
//
//  Each collection is a keyword-rich, crawlable page that lists the published
//  designs matching a tag filter (e.g. "Pink Nails", "Almond Nails", "Bridal
//  French Nails"). They target high-intent search queries the client-side-only
//  home filter can't rank for, and feed every /nails/* URL into the sitemap.
//
//  Slugs are keyword-first and end in "-nails" (e.g. `pink-nails`,
//  `short-french-nails`). Single-tag collections are generated from the four
//  highest-intent facets; combos are a small curated list of popular pairings.
//
//  Pages/sitemap enforce a minimum design count (see lib/db usage) so we never
//  publish a thin, near-empty category.
// ─────────────────────────────────────────────────────────────────────────

import type { FilterState } from "./filter";
import type { TagKey } from "./types";

/** Minimum matching designs before a collection is published (avoids thin pages). */
export const MIN_COLLECTION_DESIGNS = 3;

export type Collection = {
  /** URL slug: /nails/<slug> */
  slug: string;
  /** <title> + OpenGraph title (keyword-rich). */
  title: string;
  /** On-page H1. */
  heading: string;
  /** 1–2 sentence intro (count is appended at render time). */
  blurb: string;
  /** Strict tag filter selecting this collection's designs. */
  filters: FilterState;
  /** Meta keywords. */
  keywords: string[];
};

/** "Hand-painted" -> "hand-painted", "Lunar New Year" -> "lunar-new-year". */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Single-tag facets ───────────────────────────────────────────────────────
// The four facets with the clearest search intent. (Length/mood/season/etc.
// are still usable inside combos below, just not as standalone landing pages.)

const COLORS = [
  "Pink", "Nude", "Red", "White", "Black", "Blue", "Green", "Purple",
  "Yellow", "Orange", "Brown", "Gray", "Pastel", "Metallic", "Multicolor",
];
const SHAPES = ["Square", "Oval", "Almond", "Stiletto", "Coffin"];
const STYLES = [
  "French", "Cat-eye", "Ombre", "Chrome", "Hand-painted", "Floral", "Glitter",
  "Solid", "Aurora", "Pattern", "Marble", "Abstract", "Animal print",
];
const OCCASIONS = ["Everyday", "Office", "Bridal", "Party", "Lunar New Year", "Summer", "Winter"];

/** Everyday phrasing for an occasion, used in the intro sentence. */
const OCCASION_PHRASE: Record<string, string> = {
  Everyday: "everyday, low-key wear",
  Office: "the office and work-appropriate looks",
  Bridal: "weddings and the big day",
  Party: "parties and nights out",
  "Lunar New Year": "Tết and Lunar New Year celebrations",
  Summer: "summer and beach season",
  Winter: "winter and the holidays",
};

function singleTag(key: TagKey, value: string): Collection {
  const s = slugify(value);
  const lower = value.toLowerCase();
  let title: string;
  let heading: string;
  let blurb: string;
  switch (key) {
    case "color":
      title = `${value} Nail Designs & Ideas`;
      heading = `${value} Nails`;
      blurb = `Discover ${lower} nail inspiration — from subtle everyday sets to bold statement looks — across every shape, style and occasion.`;
      break;
    case "shape":
      title = `${value} Nails — Shape Ideas & Inspiration`;
      heading = `${value} Nails`;
      blurb = `${value}-shaped nail designs and how to style them, in every color and finish.`;
      break;
    case "style":
      title = `${value} Nails — Design Ideas`;
      heading = `${value} Nails`;
      blurb = `${value} nail art ideas and inspiration to save for your next appointment.`;
      break;
    case "occasion":
      title = `${value} Nail Designs`;
      heading = `${value} Nails`;
      blurb = `The best nail designs for ${OCCASION_PHRASE[value] ?? lower}.`;
      break;
    default:
      title = `${value} Nails`;
      heading = `${value} Nails`;
      blurb = `${value} nail designs and ideas.`;
  }
  return {
    slug: `${s}-nails`,
    title,
    heading,
    blurb,
    filters: { [key]: [value] },
    keywords: [`${lower} nails`, `${lower} nail designs`, `${lower} nail ideas`],
  };
}

// ── Curated combos (two tags) ───────────────────────────────────────────────
// Popular, high-volume pairings only — each still gates on MIN design count so
// a combo with too few matches simply won't publish.

type ComboDef = { slug: string; heading: string; filters: FilterState };

const COMBO_DEFS: ComboDef[] = [
  { slug: "short-french-nails", heading: "Short French Nails", filters: { length: ["Short"], style: ["French"] } },
  { slug: "pink-french-nails", heading: "Pink French Nails", filters: { color: ["Pink"], style: ["French"] } },
  { slug: "white-french-nails", heading: "White French Nails", filters: { color: ["White"], style: ["French"] } },
  { slug: "pink-almond-nails", heading: "Pink Almond Nails", filters: { color: ["Pink"], shape: ["Almond"] } },
  { slug: "red-almond-nails", heading: "Red Almond Nails", filters: { color: ["Red"], shape: ["Almond"] } },
  { slug: "nude-almond-nails", heading: "Nude Almond Nails", filters: { color: ["Nude"], shape: ["Almond"] } },
  { slug: "black-stiletto-nails", heading: "Black Stiletto Nails", filters: { color: ["Black"], shape: ["Stiletto"] } },
  { slug: "red-square-nails", heading: "Red Square Nails", filters: { color: ["Red"], shape: ["Square"] } },
  { slug: "chrome-coffin-nails", heading: "Chrome Coffin Nails", filters: { style: ["Chrome"], shape: ["Coffin"] } },
  { slug: "glitter-party-nails", heading: "Glitter Party Nails", filters: { style: ["Glitter"], occasion: ["Party"] } },
  { slug: "bridal-french-nails", heading: "Bridal French Nails", filters: { occasion: ["Bridal"], style: ["French"] } },
  { slug: "short-almond-nails", heading: "Short Almond Nails", filters: { length: ["Short"], shape: ["Almond"] } },
];

function combo(def: ComboDef): Collection {
  const lower = def.heading.toLowerCase();
  return {
    slug: def.slug,
    title: `${def.heading} — Design Ideas`,
    heading: def.heading,
    blurb: `Curated ${lower} — a focused edit of the most-saved looks.`,
    filters: def.filters,
    keywords: [lower, `${lower} ideas`],
  };
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const COLLECTIONS: Collection[] = [
  ...COLORS.map((v) => singleTag("color", v)),
  ...SHAPES.map((v) => singleTag("shape", v)),
  ...STYLES.map((v) => singleTag("style", v)),
  ...OCCASIONS.map((v) => singleTag("occasion", v)),
  ...COMBO_DEFS.map(combo),
];

const BY_SLUG = new Map(COLLECTIONS.map((c) => [c.slug, c]));

export function getCollection(slug: string): Collection | undefined {
  return BY_SLUG.get(slug);
}

/** Slug for a single (facet, value) landing page, if one exists (for internal links). */
export function singleCollectionSlug(key: TagKey, value: string): string | null {
  const slug = `${slugify(value)}-nails`;
  const c = BY_SLUG.get(slug);
  // Only link when the collection is the single-tag one for this exact facet.
  return c && c.filters[key]?.includes(value) ? slug : null;
}
