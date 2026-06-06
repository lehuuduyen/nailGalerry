"use client";

import Link from "next/link";
import { useFavorites } from "@/lib/store";
import type { Nail } from "@/lib/types";
import { GradientThumb } from "./GradientThumb";
import { Badge } from "./ui/Badge";
import { HeartIcon } from "./icons";

export function NailCard({ nail, score }: { nail: Nail; score?: number }) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const fav = isFavorite(nail.id);

  return (
    <Link
      href={`/nail/${nail.id}`}
      className="group block overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)] transition-transform active:scale-[0.98]"
    >
      <div className="relative">
        <GradientThumb seed={nail.id} imageUrl={nail.imageUrl} alt={nail.title} className="aspect-[4/5]" />

        <button
          type="button"
          aria-label={fav ? "Remove from saved" : "Save"}
          onClick={(e) => {
            e.preventDefault();
            toggleFavorite(nail.id);
          }}
          className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/85 backdrop-blur ${
            fav ? "text-accent" : "text-[var(--color-muted)]"
          }`}
        >
          <HeartIcon width={18} height={18} filled={fav} />
        </button>

        {score !== undefined && (
          <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
            {score} pts
          </span>
        )}
      </div>

      <div className="p-2.5">
        <div className="truncate text-[13px] font-semibold text-[var(--color-ink)]">{nail.title}</div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Badge>{nail.style}</Badge>
          <Badge tone="outline">{nail.color}</Badge>
        </div>
      </div>
    </Link>
  );
}
