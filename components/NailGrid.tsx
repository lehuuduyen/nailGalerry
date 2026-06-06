import type { Nail, ScoredNail } from "@/lib/types";
import { NailCard } from "./NailCard";

type Props = {
  nails?: Nail[];
  scored?: ScoredNail[];
  emptyTitle?: string;
  emptyHint?: string;
};

export function NailGrid({ nails, scored, emptyTitle = "No designs found", emptyHint }: Props) {
  const items = scored ?? nails?.map((nail) => ({ nail, score: undefined }));

  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 px-6 py-16 text-center">
        <div className="mb-2 text-4xl">💅</div>
        <p className="text-sm font-semibold text-[var(--color-ink)]">{emptyTitle}</p>
        {emptyHint && <p className="text-xs text-[var(--color-muted)]">{emptyHint}</p>}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 px-4 py-3">
      {items.map(({ nail, score }) => (
        <NailCard key={nail.id} nail={nail} score={score} />
      ))}
    </div>
  );
}
