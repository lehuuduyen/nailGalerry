"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { TopAppBar } from "@/components/TopAppBar";
import { GradientThumb } from "@/components/GradientThumb";
import { NailGrid } from "@/components/NailGrid";
import { Badge } from "@/components/ui/Badge";
import { HeartIcon, InstagramIcon } from "@/components/icons";
import { TAG_GROUPS } from "@/lib/constants";
import { similarNails } from "@/lib/filter";
import { useFavorites, useLibrary } from "@/lib/store";

export default function NailDetailPage() {
  const params = useParams<{ id: string }>();
  const { published: nails } = useLibrary();
  const { isFavorite, toggleFavorite } = useFavorites();

  const nail = nails.find((n) => n.id === params.id);

  if (!nail) {
    return (
      <div>
        <TopAppBar title="Design" backHref="/" />
        <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
          <p className="text-sm text-[var(--color-muted)]">This design is no longer available.</p>
          <Link href="/" className="text-sm font-semibold text-accent">
            Back to gallery
          </Link>
        </div>
      </div>
    );
  }

  const fav = isFavorite(nail.id);
  const similar = similarNails(nail, nails, 4);

  return (
    <div>
      <TopAppBar
        title={nail.title}
        backHref="/"
        right={
          <button
            onClick={() => toggleFavorite(nail.id)}
            aria-label={fav ? "Remove from saved" : "Save"}
            className={`flex h-9 w-9 items-center justify-center rounded-full ${
              fav ? "text-accent" : "text-[var(--color-muted)]"
            }`}
          >
            <HeartIcon filled={fav} />
          </button>
        }
      />

      <GradientThumb
        seed={nail.id}
        imageUrl={nail.imageUrl}
        alt={nail.title}
        className="aspect-[4/5] w-full"
      />

      <div className="px-4 pt-4">
        <h1 className="text-xl font-bold text-[var(--color-ink)]">{nail.title}</h1>
        <a
          href={nail.source.url}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)]"
        >
          <InstagramIcon width={16} height={16} />@{nail.source.handle}
        </a>

        <div className="mt-4 flex flex-col gap-3">
          {TAG_GROUPS.map((g) => (
            <div key={g.key} className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-[var(--color-muted)]">{g.label}</span>
              <Badge tone="soft">{nail[g.key]}</Badge>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6">
        <h2 className="px-4 text-sm font-bold text-[var(--color-ink)]">Similar designs</h2>
        <NailGrid nails={similar} />
      </div>
    </div>
  );
}
