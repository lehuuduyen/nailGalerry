"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-client";
import { useFavorites } from "@/lib/store";
import { sendLike } from "@/lib/likes";
import type { Nail } from "@/lib/types";
import { GradientThumb } from "./GradientThumb";
import { Badge } from "./ui/Badge";
import { HeartIcon } from "./icons";

export function NailCard({ nail, score }: { nail: Nail; score?: number }) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const { user } = useAuth();
  const router = useRouter();
  const fav = isFavorite(nail.id);
  const serverLikes = nail.likeCount ?? 0;
  const [likes, setLikes] = useState(serverLikes);

  // Re-sync the displayed count when the catalog reloads with a fresh value
  // (e.g. after the Home tab refresh). Adjusting state during render is the
  // React-recommended way to mirror a changing prop without an effect.
  const [seenServer, setSeenServer] = useState(serverLikes);
  if (serverLikes !== seenServer) {
    setSeenServer(serverLikes);
    setLikes(serverLikes);
  }

  const onHeart = async (e: React.MouseEvent) => {
    e.preventDefault();
    // Liking requires an account — send guests to log in first.
    if (!user) {
      router.push("/account");
      return;
    }
    const liking = !fav;
    toggleFavorite(nail.id);
    setLikes((n) => Math.max(0, n + (liking ? 1 : -1))); // optimistic
    const authoritative = await sendLike(nail.id, liking);
    if (authoritative !== null) setLikes(authoritative);
  };

  return (
    <Link
      href={nail.slug ? `/designs/${nail.slug}` : `/nail/${nail.id}`}
      className="group block overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)] transition-transform active:scale-[0.98]"
    >
      <div className="relative">
        <GradientThumb
          seed={nail.id}
          imageUrl={nail.imageUrl}
          alt={nail.altText ?? nail.title}
          width={400}
          className="aspect-[4/5]"
        />

        <button
          type="button"
          aria-label={fav ? "Unlike" : "Like"}
          onClick={onHeart}
          className={`absolute right-2 top-2 flex h-8 items-center gap-1 rounded-full bg-white/85 px-2 backdrop-blur ${
            fav ? "text-accent" : "text-[var(--color-muted)]"
          }`}
        >
          <HeartIcon width={18} height={18} filled={fav} />
          <span className="text-xs font-semibold tabular-nums">{likes}</span>
        </button>

        {score !== undefined && (
          <span className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white">
            {score} pts
          </span>
        )}
      </div>

      <div className="p-2.5">
        <div className="truncate text-[13px] font-semibold text-[var(--color-ink)]">{nail.title}</div>
        {nail.contributor && (
          <div className="truncate text-[11px] text-[var(--color-muted)]">by {nail.contributor}</div>
        )}
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Badge>{nail.style}</Badge>
          <Badge tone="outline">{nail.color}</Badge>
        </div>
      </div>
    </Link>
  );
}
