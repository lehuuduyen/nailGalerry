import type { Element } from "./types";

/**
 * Vietnamese "nạp âm" five-element (ngũ hành) derivation from birth year.
 * The math is the traditional rule; only the element labels are rendered in
 * English (Metal / Wood / Water / Fire / Earth).
 *
 *   can = (year - 4) % 10   -> heavenly stem
 *   chi = (year - 4) % 12   -> earthly branch
 *
 * Stem value pairs:  Giáp/Ất=1, Bính/Đinh=2, Mậu/Kỷ=3, Canh/Tân=4, Nhâm/Quý=5
 * Branch value groups: {Tý,Sửu,Ngọ,Mùi}=0, {Dần,Mão,Thân,Dậu}=1, {Thìn,Tỵ,Tuất,Hợi}=2
 * sum = stem + branch; if sum > 5 subtract 5;
 * map 1=Metal, 2=Water, 3=Fire, 4=Earth, 5=Wood
 */

// stem index (0..9) -> value 1..5
const STEM_VALUE = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
// branch index (0..11) -> value 0..2
const BRANCH_VALUE = [0, 0, 1, 1, 2, 2, 0, 0, 1, 1, 2, 2];
// nạp âm sum -> element
const SUM_TO_ELEMENT: Record<number, Element> = {
  1: "Metal",
  2: "Water",
  3: "Fire",
  4: "Earth",
  5: "Wood",
};

export function menhFromYear(year: number): Element {
  const can = ((year - 4) % 10 + 10) % 10;
  const chi = ((year - 4) % 12 + 12) % 12;
  let sum = STEM_VALUE[can] + BRANCH_VALUE[chi];
  if (sum > 5) sum -= 5;
  return SUM_TO_ELEMENT[sum];
}

/**
 * Element -> harmonious colors (tương sinh), expressed as `color` tag values
 * so they line up directly with TAG_GROUPS.
 */
export const ELEMENT_COLORS: Record<Element, string[]> = {
  Metal: ["White", "Metallic", "Nude"],
  Wood: ["Blue", "Black", "Pastel"],
  Water: ["Black", "Blue", "White"],
  Fire: ["Red", "Pink", "Blue"],
  Earth: ["Nude", "Red", "Metallic"],
};

/** Short human description of an element's vibe — used in advisor copy. */
export const ELEMENT_VI: Record<Element, string> = {
  Metal: "Kim",
  Wood: "Mộc",
  Water: "Thủy",
  Fire: "Hỏa",
  Earth: "Thổ",
};
