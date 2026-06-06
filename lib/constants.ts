import type { TagKey } from "./types";

/**
 * The 8 tag groups — the single source of truth shared by the filter sheet,
 * the admin tag editor, the AI auto-tagger, and the advisor.
 */
export type TagGroup = {
  key: TagKey;
  /** Human label shown in the UI. */
  label: string;
  values: string[];
};

export const TAG_GROUPS: TagGroup[] = [
  {
    key: "style",
    label: "Design Style",
    values: [
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
    ],
  },
  {
    key: "color",
    label: "Color",
    values: ["Pink", "Nude", "Red", "White", "Black", "Blue", "Pastel", "Metallic"],
  },
  {
    key: "shape",
    label: "Nail Shape",
    values: ["Square", "Oval", "Almond", "Stiletto", "Coffin"],
  },
  {
    key: "length",
    label: "Length",
    values: ["Short", "Medium", "Long"],
  },
  {
    key: "occasion",
    label: "Occasion / Season",
    values: ["Everyday", "Office", "Bridal", "Party", "Lunar New Year", "Summer", "Winter"],
  },
  {
    key: "mood",
    label: "Vibe",
    values: ["Minimalist", "Luxurious", "Cute", "Edgy", "Vintage", "Korean"],
  },
  {
    key: "technique",
    label: "Technique",
    values: ["Gel", "Regular polish", "Dip powder", "Press-on", "Acrylic", "Airbrush"],
  },
  {
    key: "detail",
    label: "Decoration",
    values: ["Rhinestones", "Charms", "3D flowers", "Foil/glitter", "Line art", "None"],
  },
];

/** Groups shown by default in the filter sheet. */
export const MAIN_GROUPS: TagKey[] = ["style", "color", "shape", "length", "occasion"];
/** Groups hidden behind "Advanced filters". */
export const ADVANCED_GROUPS: TagKey[] = ["mood", "technique", "detail"];

/** Quick lookup: group key -> its values. */
export const GROUP_BY_KEY: Record<TagKey, TagGroup> = Object.fromEntries(
  TAG_GROUPS.map((g) => [g.key, g]),
) as Record<TagKey, TagGroup>;

export function groupLabel(key: TagKey): string {
  return GROUP_BY_KEY[key].label;
}
