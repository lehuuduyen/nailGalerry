"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { TopAppBar } from "@/components/TopAppBar";
import { GradientThumb } from "@/components/GradientThumb";
import { NailGrid } from "@/components/NailGrid";
import { Badge } from "@/components/ui/Badge";
import { HeartIcon } from "@/components/icons";
import { TAG_GROUPS } from "@/lib/constants";
import { similarNails } from "@/lib/filter";
import { useAuth } from "@/lib/auth-client";
import { sendLike } from "@/lib/likes";
import { useFavorites, useLibrary } from "@/lib/store";

export default function NailDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { published: nails } = useLibrary();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { user } = useAuth();

  const nail = nails.find((n) => n.id === params.id);
  const serverLikes = nail?.likeCount ?? 0;
  const [likes, setLikes] = useState(serverLikes);
  // Mirror the latest server count (adjusting state during render, no effect).
  const [seenServer, setSeenServer] = useState(serverLikes);
  if (serverLikes !== seenServer) {
    setSeenServer(serverLikes);
    setLikes(serverLikes);
  }

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
            onClick={async () => {
              if (!user) {
                router.push("/account");
                return;
              }
              const liking = !fav;
              toggleFavorite(nail.id);
              setLikes((n) => Math.max(0, n + (liking ? 1 : -1)));
              const authoritative = await sendLike(nail.id, liking);
              if (authoritative !== null) setLikes(authoritative);
            }}
            aria-label={fav ? "Unlike" : "Like"}
            className={`flex h-9 items-center gap-1 rounded-full px-2 ${
              fav ? "text-accent" : "text-[var(--color-muted)]"
            }`}
          >
            <HeartIcon filled={fav} />
            <span className="text-sm font-semibold tabular-nums">{likes}</span>
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
        {nail.contributor && (
          <p className="mt-1 text-sm text-[var(--color-muted)]">Shared by {nail.contributor}</p>
        )}

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
