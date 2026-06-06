"use client";

import { FilterIcon, SearchIcon } from "./icons";

export function SearchBar({
  query,
  onQueryChange,
  activeCount,
  onOpenFilter,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  activeCount: number;
  onOpenFilter: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-4 pb-2 pt-3">
      <div className="relative flex-1">
        <SearchIcon
          width={18}
          height={18}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]"
        />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search designs, colors, vibes…"
          className="h-11 w-full rounded-full border border-[var(--color-line)] bg-white pl-10 pr-4 text-sm outline-none placeholder:text-[var(--color-muted)] focus:border-accent"
        />
      </div>
      <button
        type="button"
        onClick={onOpenFilter}
        aria-label="Filters"
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--color-line)] bg-white text-[var(--color-ink)] active:bg-accent-tint"
      >
        <FilterIcon width={20} height={20} />
        {activeCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>
    </div>
  );
}
