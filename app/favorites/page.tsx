"use client";

import { TopAppBar } from "@/components/TopAppBar";
import { NailGrid } from "@/components/NailGrid";
import { useFavorites, useLibrary } from "@/lib/store";

export default function FavoritesPage() {
  const { published: nails } = useLibrary();
  const { favorites } = useFavorites();

  const saved = nails.filter((n) => favorites.includes(n.id));

  return (
    <div>
      <TopAppBar title="Saved designs" />
      <div className="px-4 pt-3 text-xs text-[var(--color-muted)]">
        {saved.length} saved
      </div>
      <NailGrid
        nails={saved}
        emptyTitle="No saved designs yet"
        emptyHint="Tap the heart on any design to save it here."
      />
    </div>
  );
}
