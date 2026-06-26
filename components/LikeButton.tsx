"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-client";
import { sendLike } from "@/lib/likes";
import { useFavorites } from "@/lib/store";
import { HeartIcon } from "./icons";

/** Interactive like ("tym") button for the server-rendered design page. */
export function LikeButton({ id, initialCount }: { id: string; initialCount: number }) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const { user } = useAuth();
  const router = useRouter();
  const fav = isFavorite(id);
  const [likes, setLikes] = useState(initialCount);

  async function onClick() {
    if (!user) {
      router.push("/account");
      return;
    }
    const liking = !fav;
    toggleFavorite(id);
    setLikes((n) => Math.max(0, n + (liking ? 1 : -1)));
    const authoritative = await sendLike(id, liking);
    if (authoritative !== null) setLikes(authoritative);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={fav ? "Unlike" : "Like"}
      className={`inline-flex h-10 items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-white px-4 text-sm font-semibold ${
        fav ? "text-accent" : "text-[var(--color-muted)]"
      }`}
    >
      <HeartIcon width={18} height={18} filled={fav} />
      {likes}
    </button>
  );
}
