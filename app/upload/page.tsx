"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { TopAppBar } from "@/components/TopAppBar";
import { SelectChips } from "@/components/TagChipGroup";
import { Button } from "@/components/ui/Button";
import { UploadIcon, UserIcon } from "@/components/icons";
import { TAG_GROUPS } from "@/lib/constants";
import { useAuth } from "@/lib/auth-client";
import type { NailTags, TagKey } from "@/lib/types";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/** Start each tag group on its first allowed value. */
function initialTags(): NailTags {
  const tags = {} as NailTags;
  for (const g of TAG_GROUPS) tags[g.key as TagKey] = g.values[0];
  return tags;
}

/** Read a File into a base64 data URL. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function UploadPage() {
  const { user, loading: authLoading } = useAuth();
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState<NailTags>(initialTags);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Image is too large (max 8 MB).");
      return;
    }
    try {
      setDataUrl(await fileToDataUrl(file));
    } catch {
      setError("Couldn't read that image. Try another one.");
    }
  }

  async function onSubmit() {
    if (loading || !dataUrl) {
      if (!dataUrl) setError("Please choose a photo to share.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/contribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), dataUrl, tags }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't submit. Please try again.");
        return;
      }
      setDone(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function shareAnother() {
    setTitle("");
    setTags(initialTags());
    setDataUrl(null);
    setDone(false);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const setTag = (key: TagKey, value: string) => setTags((t) => ({ ...t, [key]: value }));

  if (authLoading) {
    return (
      <div>
        <TopAppBar title="Share your nails" backHref="/account" />
        <div className="flex justify-center py-20">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        </div>
      </div>
    );
  }

  // Uploads are tied to an account so the owner can manage them later.
  if (!user) {
    return (
      <div>
        <TopAppBar title="Share your nails" backHref="/account" />
        <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
            <UserIcon width={26} height={26} />
          </div>
          <h1 className="text-lg font-bold text-[var(--color-ink)]">Sign in to upload</h1>
          <p className="max-w-xs text-sm text-[var(--color-muted)]">
            Create an account or log in so you can upload designs and track their approval status.
          </p>
          <Link href="/account" className="mt-2">
            <Button>Go to account</Button>
          </Link>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div>
        <TopAppBar title="Share your nails" backHref="/account" />
        <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft text-accent">
            <UploadIcon width={26} height={26} />
          </div>
          <h1 className="text-lg font-bold text-[var(--color-ink)]">Thanks, @{user.username}! 💕</h1>
          <p className="max-w-xs text-sm text-[var(--color-muted)]">
            Your design was submitted and is now waiting for approval. Track its status on your
            account page.
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" onClick={shareAnother}>
              Share another
            </Button>
            <Link href="/account">
              <Button>My uploads</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopAppBar title="Share your nails" backHref="/account" />

      <div className="px-4 pb-24 pt-4">
        <p className="text-sm text-[var(--color-muted)]">
          Show off your nail design! Upload a photo and we&apos;ll add it to the gallery after a
          quick review.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-[var(--color-ink)]">
              Title <span className="font-normal text-[var(--color-muted)]">(optional)</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="e.g. Pink ombre almond"
              className="h-11 w-full rounded-xl border border-[var(--color-line)] bg-white px-3 text-sm outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="mb-1 block text-[13px] font-semibold text-[var(--color-ink)]">
              Photo
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={onPick}
              className="hidden"
            />
            {dataUrl ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="relative block w-full overflow-hidden rounded-2xl border border-[var(--color-line)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={dataUrl} alt="Preview" className="aspect-[4/5] w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 bg-black/45 py-2 text-center text-xs font-medium text-white">
                  Tap to change photo
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--color-line)] bg-white text-[var(--color-muted)] active:bg-accent-tint"
              >
                <UploadIcon width={28} height={28} />
                <span className="text-sm font-medium">Choose a photo</span>
                <span className="text-[11px]">JPG, PNG or WEBP · up to 8 MB</span>
              </button>
            )}
          </div>

          <div>
            <p className="mb-1 text-[13px] font-semibold text-[var(--color-ink)]">
              Design details
            </p>
            <p className="mb-3 text-xs text-[var(--color-muted)]">
              Pick what best describes your nails. A moderator may fine-tune these before publishing.
            </p>
            <div className="flex flex-col gap-4">
              {TAG_GROUPS.map((g) => (
                <SelectChips
                  key={g.key}
                  group={g}
                  value={tags[g.key]}
                  onChange={(v) => setTag(g.key, v)}
                />
              ))}
            </div>
          </div>

          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

          <Button className="w-full" onClick={onSubmit} disabled={loading || !dataUrl}>
            {loading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Submitting…
              </>
            ) : (
              <>
                <UploadIcon width={18} height={18} /> Submit for review
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
