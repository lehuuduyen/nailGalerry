"use client";

import { useState } from "react";
import { TAG_GROUPS } from "@/lib/constants";
import { useLibrary } from "@/lib/store";
import type { Nail, NailTags, TagKey } from "@/lib/types";
import { GradientThumb } from "./GradientThumb";
import { SelectChips } from "./TagChipGroup";
import { Button } from "./ui/Button";
import { CheckIcon, CloseIcon } from "./icons";

export function PublishedNailCard({
  nail,
  selected,
  onToggleSelect,
  onApprove,
}: {
  nail: Nail;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** When provided (pending items), shows an "Approve" button. */
  onApprove?: () => void;
}) {
  const { updateNail, removeNail } = useLibrary();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(nail.title);
  const [tags, setTags] = useState<NailTags>(() => {
    const t = {} as NailTags;
    for (const g of TAG_GROUPS) t[g.key as TagKey] = nail[g.key as TagKey];
    return t;
  });

  const setTag = (key: TagKey, value: string) => setTags((t) => ({ ...t, [key]: value }));

  const onSave = () => {
    updateNail(nail.id, { title: title.trim() || nail.title, ...tags });
    setEditing(false);
  };

  const onDelete = () => {
    if (window.confirm("Xoá thiết kế này? Ảnh sẽ bị xoá khỏi R2. Không thể hoàn tác.")) {
      removeNail(nail.id);
    }
  };

  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-[var(--shadow-card)]">
      <GradientThumb
        seed={nail.id}
        imageUrl={nail.imageUrl}
        alt={nail.title}
        className="aspect-[16/10] w-full"
      >
        {onToggleSelect && (
          <label className="absolute right-2 top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/85 shadow-[var(--shadow-card)] backdrop-blur">
            <input
              type="checkbox"
              checked={Boolean(selected)}
              onChange={onToggleSelect}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
          </label>
        )}
      </GradientThumb>

      {!editing ? (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--color-ink)]">{nail.title}</p>
              {nail.contributor && (
                <p className="truncate text-[12px] font-medium text-accent">
                  by {nail.contributor}
                </p>
              )}
              <p className="truncate text-[12px] text-[var(--color-muted)]">
                {nail.color} · {nail.style} · {nail.shape} · {nail.length}
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="sm" variant="danger" onClick={onDelete}>
              <CloseIcon width={15} height={15} /> Xoá
            </Button>
          </div>
          {onApprove && (
            <Button size="sm" className="w-full" onClick={onApprove}>
              <CheckIcon width={16} height={16} /> Duyệt &amp; publish
            </Button>
          )}
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

          {TAG_GROUPS.map((g) => (
            <SelectChips key={g.key} group={g} value={tags[g.key]} onChange={(v) => setTag(g.key, v)} />
          ))}

          <div className="flex items-center gap-3 pt-1">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                setEditing(false);
                setTitle(nail.title);
              }}
            >
              Huỷ
            </Button>
            <Button className="flex-[2]" onClick={onSave}>
              <CheckIcon width={16} height={16} /> Lưu thay đổi
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
