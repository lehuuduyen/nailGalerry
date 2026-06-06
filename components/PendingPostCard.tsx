"use client";

import { useEffect, useState } from "react";
import { TAG_GROUPS } from "@/lib/constants";
import { useLibrary } from "@/lib/store";
import type { NailTags, PendingPost, TagKey } from "@/lib/types";
import { GradientThumb } from "./GradientThumb";
import { SelectChips } from "./TagChipGroup";
import { Button } from "./ui/Button";
import { CheckIcon, CloseIcon, InstagramIcon } from "./icons";

export function PendingPostCard({ post }: { post: PendingPost }) {
  const { approve, reject } = useLibrary();
  const [title, setTitle] = useState(post.title);
  const [tags, setTags] = useState<Partial<NailTags>>(post.suggestedTags);
  const [seeded, setSeeded] = useState(false);

  // Seed the editable tags once the AI finishes analyzing this post.
  useEffect(() => {
    if (post.status === "review" && !seeded) {
      setTags(post.suggestedTags);
      setSeeded(true);
    }
  }, [post.status, post.suggestedTags, seeded]);

  const setTag = (key: TagKey, value: string) => setTags((t) => ({ ...t, [key]: value }));

  // Every group must have a value before publishing; fall back to the first value.
  const allChosen = TAG_GROUPS.every((g) => Boolean(tags[g.key]));

  const onApprove = () => {
    const full = {} as NailTags;
    for (const g of TAG_GROUPS) full[g.key as TagKey] = tags[g.key] ?? g.values[0];
    approve(post, title.trim() || post.title, full);
  };

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)]">
      <GradientThumb
        seed={post.id}
        imageUrl={post.imageUrl}
        alt={post.title}
        className="aspect-[16/10] w-full"
      >
        <div className="absolute bottom-2 left-3 inline-flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur">
          <InstagramIcon width={13} height={13} />@{post.source.handle}
        </div>
      </GradientThumb>

      {post.status === "analyzing" ? (
        <div className="flex items-center gap-3 px-4 py-6">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <span className="text-sm text-[var(--color-muted)]">AI is analyzing this post…</span>
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4">
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-[var(--color-ink)]">
              Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 w-full rounded-xl border border-[var(--color-line)] bg-white px-3 text-sm outline-none focus:border-accent"
            />
          </div>

          <p className="-mb-1 text-[12px] text-[var(--color-muted)]">
            Review the AI-suggested tags and adjust before publishing.
          </p>

          {TAG_GROUPS.map((g) => (
            <SelectChips key={g.key} group={g} value={tags[g.key]} onChange={(v) => setTag(g.key, v)} />
          ))}

          <div className="flex items-center gap-3 pt-1">
            <Button variant="danger" className="flex-1" onClick={() => reject(post.id)}>
              <CloseIcon width={16} height={16} /> Reject
            </Button>
            <Button className="flex-[2]" onClick={onApprove} disabled={!allChosen}>
              <CheckIcon width={16} height={16} /> Approve &amp; publish
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
