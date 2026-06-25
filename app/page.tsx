"use client";

import { useEffect, useState } from "react";
import { TopAppBar } from "@/components/TopAppBar";
import { SearchBar } from "@/components/SearchBar";
import { ActiveFilters } from "@/components/ActiveFilters";
import { FilterSheet } from "@/components/FilterSheet";
import { NailGrid } from "@/components/NailGrid";
import { countActive, EMPTY_FILTERS, useNailFilter, type FilterState } from "@/lib/filter";
import { useLibrary } from "@/lib/store";

export default function HomePage() {
  const { published: nails, refresh } = useLibrary();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Re-fetch fresh images + like counts every time the Home tab is opened.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const results = useNailFilter(nails, filters, query);

  return (
    <div>
      <TopAppBar brand />

      <SearchBar
        query={query}
        onQueryChange={setQuery}
        activeCount={countActive(filters)}
        onOpenFilter={() => setSheetOpen(true)}
      />

      <ActiveFilters filters={filters} setFilters={setFilters} />

      <div className="px-4 pt-1 text-xs text-[var(--color-muted)]">
        {results.length} {results.length === 1 ? "design" : "designs"}
      </div>

      <NailGrid
        nails={results}
        emptyTitle="No designs match"
        emptyHint="Try removing a filter or clearing your search."
      />

      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        setFilters={setFilters}
        resultCount={results.length}
      />
    </div>
  );
}
