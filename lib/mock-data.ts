import { TAG_GROUPS } from "./constants";
import type { InstagramSource, Nail, NailTags, TagKey } from "./types";

// Small seeded RNG so the mock library is deterministic across reloads.
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

function pick<T>(arr: T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length];
}

const NAIL_TITLES = [
  "Rosé French Tips",
  "Midnight Cat-eye",
  "Cloud Ombre",
  "Mirror Chrome Set",
  "Cherry Blossom Hand-paint",
  "Pastel Daisy Field",
  "Champagne Glitter",
  "Bare Minimal Nude",
  "Aurora Glass",
  "Marble Whisper",
  "Bridal Pearl French",
  "Lunar Red Charm",
  "Office Almond Nude",
  "Party Disco Chrome",
  "Summer Citrus Pop",
  "Winter Frost Tips",
  "Korean Milky Gradient",
  "Velvet Cat-eye",
  "Soft Lilac Ombre",
  "Gold Foil Accent",
  "Strawberry Milk",
  "Onyx Stiletto",
  "Sky Blue Aura",
  "Vintage Rouge",
  "Sugared Almond",
  "Crystal Bloom 3D",
  "Coffin Coffee Nude",
  "Glazed Donut Set",
  "Tea Rose French",
  "Electric Edge",
];

// Mock Instagram handles content is "imported" from.
const HANDLES = [
  "naillib.studio",
  "polish.poetry",
  "the.nail.diary",
  "glaze.atelier",
  "petal.press.nails",
];

function igSource(seed: string, idx: number): InstagramSource {
  const handle = HANDLES[idx % HANDLES.length];
  return {
    platform: "instagram",
    handle,
    url: `https://instagram.com/${handle}/p/${seed}`,
  };
}

function tagsFromRng(rng: () => number): NailTags {
  const tags = {} as NailTags;
  for (const group of TAG_GROUPS) {
    tags[group.key as TagKey] = pick(group.values, rng());
  }
  return tags;
}

function buildMockNails(): Nail[] {
  return NAIL_TITLES.map((title, i) => {
    const id = `nail-${String(i + 1).padStart(2, "0")}`;
    const rng = makeRng(i * 2654435761 + 7);
    return {
      id,
      title,
      ...tagsFromRng(rng),
      source: igSource(id, i),
    };
  });
}

/** ~30 fully-tagged published designs. */
export const MOCK_NAILS: Nail[] = buildMockNails();

/** Posts sitting on Instagram, not yet imported — fed by the admin import button. */
export type InstagramPost = {
  id: string;
  title: string;
  source: InstagramSource;
};

const POOL_TITLES = [
  "Frosted Almond Tips",
  "Berry Swirl Ombre",
  "Moonstone Chrome",
  "Wildflower Hand-paint",
  "Bubblegum Glitter",
  "Bare Glaze",
  "Holo Aurora",
  "Inky Cat-eye",
  "Petal Pink French",
  "Confetti Party Set",
];

export const INSTAGRAM_POOL: InstagramPost[] = POOL_TITLES.map((title, i) => {
  const id = `ig-${String(i + 1).padStart(2, "0")}`;
  return { id, title, source: igSource(id, i + 2) };
});
