"use client";

import type { TagGroup } from "@/lib/constants";

export function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors ${
        active
          ? "border-accent bg-accent text-white"
          : "border-[var(--color-line)] bg-white text-[var(--color-ink)] active:bg-accent-tint"
      }`}
    >
      {label}
    </button>
  );
}

/** Multi-select chips for a group (used by the filter sheet). OR semantics. */
export function FilterChips({
  group,
  selected,
  onToggle,
}: {
  group: TagGroup;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-[13px] font-semibold text-[var(--color-ink)]">{group.label}</div>
      <div className="flex flex-wrap gap-2">
        {group.values.map((v) => (
          <Chip key={v} label={v} active={selected.includes(v)} onClick={() => onToggle(v)} />
        ))}
      </div>
    </div>
  );
}

/** Single-select chips for a group (used by the admin tag editor). */
export function SelectChips({
  group,
  value,
  onChange,
}: {
  group: TagGroup;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 text-[13px] font-semibold text-[var(--color-ink)]">{group.label}</div>
      <div className="flex flex-wrap gap-2">
        {group.values.map((v) => (
          <Chip key={v} label={v} active={value === v} onClick={() => onChange(v)} />
        ))}
      </div>
    </div>
  );
}
