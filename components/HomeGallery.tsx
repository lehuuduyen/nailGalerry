"use client";

import { useState } from "react";
import { SearchBar } from "@/components/SearchBar";
import { ActiveFilters } from "@/components/ActiveFilters";
import { FilterSheet } from "@/components/FilterSheet";
import { NailGrid } from "@/components/NailGrid";
import { countActive, EMPTY_FILTERS, useNailFilter, type FilterState } from "@/lib/filter";
import type { Nail } from "@/lib/types";

// Interactive gallery (search + filters). Seeded with `initialNails` rendered
// by the server, so the grid HTML is in the initial response (crawlable) while
// the filtering stays client-side.
export function HomeGallery({ initialNails }: { initialNails: Nail[] }) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const results = useNailFilter(initialNails, filters, query);

  return (
    <>
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
    </>
  );
}
