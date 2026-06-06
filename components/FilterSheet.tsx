"use client";

import { useState } from "react";
import { ADVANCED_GROUPS, GROUP_BY_KEY, MAIN_GROUPS } from "@/lib/constants";
import { countActive, toggleTag, type FilterState } from "@/lib/filter";
import type { TagKey } from "@/lib/types";
import { BottomSheet } from "./ui/BottomSheet";
import { Button } from "./ui/Button";
import { FilterChips } from "./TagChipGroup";

export function FilterSheet({
  open,
  onClose,
  filters,
  setFilters,
  resultCount,
}: {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  resultCount: number;
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const active = countActive(filters);

  const renderGroup = (key: TagKey) => (
    <FilterChips
      key={key}
      group={GROUP_BY_KEY[key]}
      selected={filters[key] ?? []}
      onToggle={(v) => setFilters(toggleTag(filters, key, v))}
    />
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Filters"
      footer={
        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={() => setFilters({})}
            disabled={active === 0}
          >
            Clear all
          </Button>
          <Button className="flex-[2]" onClick={onClose}>
            Show {resultCount} {resultCount === 1 ? "design" : "designs"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5 pt-1">
        {MAIN_GROUPS.map(renderGroup)}

        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className="self-start text-sm font-semibold text-accent"
        >
          {showAdvanced ? "− Hide advanced filters" : "+ Advanced filters"}
        </button>

        {showAdvanced && (
          <div className="flex flex-col gap-5">{ADVANCED_GROUPS.map(renderGroup)}</div>
        )}
      </div>
    </BottomSheet>
  );
}
