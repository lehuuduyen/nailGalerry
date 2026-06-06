"use client";

import { GROUP_BY_KEY } from "@/lib/constants";
import { countActive, toggleTag, type FilterState } from "@/lib/filter";
import type { TagKey } from "@/lib/types";
import { CloseIcon } from "./icons";

export function ActiveFilters({
  filters,
  setFilters,
}: {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
}) {
  if (countActive(filters) === 0) return null;

  const entries: { key: TagKey; value: string }[] = [];
  (Object.keys(filters) as TagKey[]).forEach((key) => {
    (filters[key] ?? []).forEach((value) => entries.push({ key, value }));
  });

  return (
    <div className="scroll-x flex items-center gap-2 px-4 py-1">
      {entries.map(({ key, value }) => (
        <button
          key={`${key}:${value}`}
          onClick={() => setFilters(toggleTag(filters, key, value))}
          className="flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-3 py-1 text-[12px] font-medium text-accent"
          title={GROUP_BY_KEY[key].label}
        >
          {value}
          <CloseIcon width={13} height={13} />
        </button>
      ))}
      <button
        onClick={() => setFilters({})}
        className="shrink-0 rounded-full px-2 py-1 text-[12px] font-semibold text-[var(--color-muted)] underline"
      >
        Clear all
      </button>
    </div>
  );
}
