// ─────────────────────────────────────────────────────────────────────────
//  AI integration layer.
//
//  Every AI/backend touchpoint for NailLib lives here. Today these are mocks
//  (rule-based + simulated latency). To go live, swap the bodies for real API
//  calls — the rest of the app only depends on the signatures below.
// ─────────────────────────────────────────────────────────────────────────

import { GROUP_BY_KEY, TAG_GROUPS } from "./constants";
import { ELEMENT_COLORS, menhFromYear } from "./fengshui";
import type { Element, Nail, NailTags, ScoredNail, TagKey } from "./types";

function delay(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

function sample<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Random placeholder tags — used when no image is available or AI is off. */
function randomTags(): Partial<NailTags> {
  const tags: Partial<NailTags> = {};
  for (const group of TAG_GROUPS) {
    tags[group.key as TagKey] = sample(group.values);
  }
  return tags;
}

/**
 * Auto-tag a nail-design image. Returns a suggested value for each of the 8
 * groups, which the admin can then edit/confirm in the review queue.
 *
 * When an `imageUrl` is given, this asks the vision model via `/api/auto-tag`
 * (Google Gemini) to classify the actual photo. Falls back to random
 * placeholder tags when there's no image or the model isn't configured/fails.
 */
export async function autoTagImage(input?: {
  title?: string;
  imageUrl?: string;
  caption?: string;
}): Promise<Partial<NailTags>> {
  if (!input?.imageUrl) {
    await delay(900 + Math.random() * 700); // simulate model latency
    return randomTags();
  }
  try {
    const res = await fetch("/api/auto-tag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageUrl: input.imageUrl, caption: input.caption }),
    });
    if (!res.ok) return randomTags();
    const data = (await res.json()) as { tags?: Partial<NailTags> };
    // Use the model's tags; backfill any the model omitted with a random pick.
    return { ...randomTags(), ...(data.tags ?? {}) };
  } catch {
    return randomTags();
  }
}

// ── Advisor ────────────────────────────────────────────────────────────────

export type AdvisorProfile = {
  name: string;
  birthYear: number;
  favoriteColor: string;
  occasion: string;
};

export type AdvisorResult = {
  reply: string;
  age: number;
  element: Element;
  recommendedColors: string[];
  recommendations: ScoredNail[];
};

const CURRENT_YEAR = 2026;

const YOUNG_VIBES = ["Cute", "Korean"];
const MATURE_VIBES = ["Luxurious", "Minimalist", "Vintage"];

/**
 * Score one design against the user's profile.
 *   +3 color is feng-shui harmonious with the element
 *   +2 color equals the favorite color
 *   +3 occasion matches
 *   +1 vibe fits the age band
 */
export function scoreNail(
  nail: Nail,
  profile: AdvisorProfile,
  elementColors: string[],
  age: number,
): number {
  let score = 0;
  if (elementColors.includes(nail.color)) score += 3;
  if (nail.color === profile.favoriteColor) score += 2;
  if (nail.occasion === profile.occasion) score += 3;
  if (age < 25 && YOUNG_VIBES.includes(nail.mood)) score += 1;
  if (age >= 30 && MATURE_VIBES.includes(nail.mood)) score += 1;
  return score;
}

/**
 * Conversational advisor. Currently rule-based: derives age + ngũ hành element,
 * scores every design, and returns the top 4.
 *
 * TODO: replace with a real chat model (`POST /api/advisor`) for natural,
 * multi-turn dialogue. The scoring above can become a tool the model calls.
 */
export function chatAdvisor(profile: AdvisorProfile, nails: Nail[]): AdvisorResult {
  const age = Math.max(0, CURRENT_YEAR - profile.birthYear);
  const element = menhFromYear(profile.birthYear);
  const recommendedColors = ELEMENT_COLORS[element];

  const recommendations: ScoredNail[] = nails
    .map((nail) => ({ nail, score: scoreNail(nail, profile, recommendedColors, age) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const colorLabel = GROUP_BY_KEY.color.label;
  const reply =
    `Lovely to meet you, ${profile.name || "there"}! ` +
    `At ${age}, your element is ${element}, so harmonious ${colorLabel.toLowerCase()} tones are ` +
    `${recommendedColors.join(", ")}. ` +
    `Here are 4 designs picked for your ${profile.occasion.toLowerCase()} occasion and love of ${profile.favoriteColor.toLowerCase()}.`;

  return { reply, age, element, recommendedColors, recommendations };
}
