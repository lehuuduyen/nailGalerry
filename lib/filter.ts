import { useMemo } from "react";
import { TAG_GROUPS } from "./constants";
import type { Nail, TagKey } from "./types";

/** Selected tag values per group. Empty/absent group = no constraint. */
export type FilterState = Partial<Record<TagKey, string[]>>;

export const EMPTY_FILTERS: FilterState = {};

export function toggleTag(state: FilterState, key: TagKey, value: string): FilterState {
  const current = state[key] ?? [];
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  const updated = { ...state, [key]: next };
  if (next.length === 0) delete updated[key];
  return updated;
}

export function countActive(state: FilterState): number {
  return Object.values(state).reduce((sum, arr) => sum + (arr?.length ?? 0), 0);
}

/** True if a nail satisfies the filters (OR within a group, AND across groups). */
function matchesFilters(nail: Nail, filters: FilterState): boolean {
  for (const group of TAG_GROUPS) {
    const selected = filters[group.key];
    if (selected && selected.length > 0 && !selected.includes(nail[group.key])) {
      return false;
    }
  }
  return true;
}

/** Free-text search across the title and every tag value. */
function matchesQuery(nail: Nail, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [nail.title, ...TAG_GROUPS.map((g) => nail[g.key])]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/** Pure filtering used by the gallery. */
export function filterNails(nails: Nail[], filters: FilterState, query: string): Nail[] {
  return nails.filter((n) => matchesFilters(n, filters) && matchesQuery(n, query));
}

export function useNailFilter(nails: Nail[], filters: FilterState, query: string): Nail[] {
  return useMemo(() => filterNails(nails, filters, query), [nails, filters, query]);
}

/** Designs most similar to `target` by shared tag count (for the detail page). */
export function similarNails(target: Nail, all: Nail[], n = 4): Nail[] {
  return all
    .filter((x) => x.id !== target.id)
    .map((x) => ({
      nail: x,
      shared: TAG_GROUPS.reduce((c, g) => c + (x[g.key] === target[g.key] ? 1 : 0), 0),
    }))
    .sort((a, b) => b.shared - a.shared)
    .slice(0, n)
    .map((x) => x.nail);
}
