import type { Nail } from "./types";

// Build an SEO-friendly, keyword-rich slug from a design's main tags + a short
// stable id suffix (keeps it unique). Mirrors the slugs produced by the enrich
// pipeline, e.g. "ombre-pink-almond-party-gel-nails-a1b2c3".

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

export function buildSlug(
  nail: Pick<Nail, "id" | "title" | "color" | "shape" | "occasion" | "style" | "length" | "technique">,
): string {
  const parts = [
    nail.style,
    nail.color,
    nail.shape,
    nail.length,
    nail.occasion,
    nail.technique,
  ].filter(Boolean) as string[];
  const tail = nail.id.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toLowerCase() || "x";
  const base = slugify(parts.join(" ") || nail.title || "nail-design");
  return `${base}-nails-${tail}`;
}
