"use client";

import { useState } from "react";
import { TopAppBar } from "@/components/TopAppBar";
import { PendingPostCard } from "@/components/PendingPostCard";
import { Button } from "@/components/ui/Button";
import { InstagramIcon } from "@/components/icons";
import { useLibrary } from "@/lib/store";

type Mode = "post" | "profile";

export default function AdminPage() {
  const { pending, nails, importFromUrl, importProfile, importSamplePosts, approveAll } =
    useLibrary();
  const [mode, setMode] = useState<Mode>("profile");
  const [value, setValue] = useState("");
  const [count, setCount] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reviewCount = pending.filter((p) => p.status === "review").length;

  async function onImport() {
    const trimmed = value.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setNotice(null);
    const result =
      mode === "profile" ? await importProfile(trimmed, count) : await importFromUrl(trimmed);
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Import failed.");
      return;
    }
    if (mode === "profile") {
      const added = result.count ?? 0;
      const skipped = result.skipped ?? 0;
      if (added === 0) {
        setNotice(
          skipped > 0
            ? `Nothing new — all ${skipped} recent posts are already imported. Raise the count to fetch older posts.`
            : "No posts found.",
        );
      } else {
        setNotice(
          `Imported ${added} new post${added > 1 ? "s" : ""}` +
            (skipped > 0 ? ` (${skipped} already in your library)` : "") +
            ".",
        );
      }
      // Keep the URL so it's easy to raise the count and fetch more.
    } else {
      setValue("");
    }
  }

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(m);
        setError(null);
        setNotice(null);
      }}
      className={`flex-1 rounded-full py-2 text-xs font-semibold transition-colors ${
        mode === m ? "bg-accent text-white" : "text-[var(--color-muted)]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <TopAppBar title="Admin · Review" />

      <div className="px-4 pt-3">
        <div className="rounded-3xl bg-accent-tint p-4">
          <p className="text-sm font-semibold text-[var(--color-ink)]">Import from Instagram</p>

          <div className="mt-3 flex gap-1 rounded-full bg-white/70 p-1">
            {tab("profile", "Whole profile")}
            {tab("post", "Single post")}
          </div>

          <p className="mt-2 text-xs text-[var(--color-muted)]">
            {mode === "profile"
              ? "Paste a profile link (e.g. instagram.com/nailssxatzi). Pulls recent posts via the Apify scraper — needs APIFY_TOKEN. Re-importing skips posts you already have."
              : "Paste a post link (needs an oEmbed token), or right-click the photo → “Copy image address” and paste that direct image link."}
          </p>

          <div className="mt-3 flex flex-col gap-2">
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onImport()}
              inputMode="url"
              placeholder={
                mode === "profile"
                  ? "https://www.instagram.com/nailssxatzi/"
                  : "https://www.instagram.com/p/…"
              }
              className="h-11 w-full rounded-full border border-[var(--color-line)] bg-white px-4 text-sm outline-none focus:border-accent"
            />

            {mode === "profile" && (
              <label className="flex items-center justify-between gap-2 px-1 text-xs text-[var(--color-muted)]">
                How many recent posts
                <select
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="h-9 rounded-full border border-[var(--color-line)] bg-white px-3 text-sm text-[var(--color-ink)] outline-none focus:border-accent"
                >
                  <option value={12}>12</option>
                  <option value={30}>30</option>
                  <option value={50}>50</option>
                </select>
              </label>
            )}
            <Button className="w-full" onClick={onImport} disabled={loading || !value.trim()}>
              {loading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {mode === "profile" ? "Scraping profile…" : "Fetching…"}
                </>
              ) : (
                <>
                  <InstagramIcon width={18} height={18} />
                  {mode === "profile" ? "Import profile" : "Import post"}
                </>
              )}
            </Button>
          </div>

          {error && (
            <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
          )}
          {notice && (
            <p className="mt-2 rounded-xl bg-green-50 px-3 py-2 text-xs text-green-700">{notice}</p>
          )}

          <button
            type="button"
            onClick={importSamplePosts}
            className="mt-2 text-xs font-medium text-accent underline"
          >
            Or load sample posts (demo)
          </button>

          <p className="mt-1 text-[11px] text-[var(--color-muted)]">{nails.length} designs live</p>
        </div>
      </div>

      <div className="px-4 pb-4 pt-2">
        <div className="mb-2 mt-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--color-ink)]">
            Review queue {pending.length > 0 && `(${pending.length})`}
          </h2>
          {reviewCount > 1 && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const n = approveAll();
                setNotice(`Published ${n} designs.`);
              }}
            >
              Approve all ({reviewCount})
            </Button>
          )}
        </div>

        {pending.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-3xl bg-white py-12 text-center shadow-[var(--shadow-card)]">
            <div className="mb-1 text-3xl">📥</div>
            <p className="text-sm font-semibold text-[var(--color-ink)]">Queue is clear</p>
            <p className="text-xs text-[var(--color-muted)]">
              Import a profile or post above to get started.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {pending.map((post) => (
              <PendingPostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
