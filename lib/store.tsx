"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { autoTagImage } from "./ai";
import { TAG_GROUPS } from "./constants";
import { INSTAGRAM_POOL, MOCK_NAILS } from "./mock-data";
import type { Nail, NailTags, PendingPost, TagKey } from "./types";

/** Fill every tag group, falling back to the first value if AI left one blank. */
function completeTags(suggested: Partial<NailTags>): NailTags {
  const tags = {} as NailTags;
  for (const g of TAG_GROUPS) tags[g.key as TagKey] = suggested[g.key as TagKey] ?? g.values[0];
  return tags;
}

const LS_NAILS = "naillib:nails";
const LS_PENDING = "naillib:pending";
const LS_IMPORTS = "naillib:imports";
const LS_FAVS = "naillib:favorites";

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / private-mode errors */
  }
}

// ── Library (published designs + admin review queue) ────────────────────────

type ImportOutcome = { ok: boolean; error?: string; count?: number; skipped?: number };

type LibraryContextValue = {
  nails: Nail[];
  pending: PendingPost[];
  /** Fetch a real post by URL via /api/instagram, then queue it for review. */
  importFromUrl: (url: string) => Promise<ImportOutcome>;
  /** Pull recent posts from a profile via /api/instagram/profile (Apify). */
  importProfile: (url: string, limit?: number) => Promise<ImportOutcome>;
  /** Load mock sample posts (offline demo / fallback). */
  importSamplePosts: () => void;
  approve: (post: PendingPost, title: string, tags: NailTags) => void;
  /** Publish every post currently in "review" with its suggested tags. */
  approveAll: () => number;
  reject: (id: string) => void;
};

const LibraryContext = createContext<LibraryContextValue | null>(null);

const IMPORT_BATCH = 3;

/** Build a short, friendly title from an Instagram caption. */
function titleFromCaption(caption: string, handle: string): string {
  const clean = caption.replace(/\s+/g, " ").trim();
  if (!clean) return `@${handle} nail design`;
  const words = clean.split(" ").slice(0, 6).join(" ");
  return words.length < clean.length ? `${words}…` : words;
}

function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [nails, setNails] = useState<Nail[]>(MOCK_NAILS);
  const [pending, setPending] = useState<PendingPost[]>([]);
  // How many import batches have ever run — keeps generated ids unique and
  // lets us cycle the mock pool forever so the button never silently no-ops.
  // The ref is the authoritative counter (collision-proof across rapid clicks);
  // state mirrors it only for localStorage persistence.
  const [importCount, setImportCount] = useState(0);
  const importCountRef = useRef(0);
  const [hydrated, setHydrated] = useState(false);

  // Mirrors for reads inside callbacks without stale closures.
  const pendingRef = useRef<PendingPost[]>([]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  const nailsRef = useRef<Nail[]>(MOCK_NAILS);
  useEffect(() => {
    nailsRef.current = nails;
  }, [nails]);

  // Run AI tagging for a single post, flipping it to "review" when done.
  const runTag = useCallback((post: PendingPost) => {
    autoTagImage({ title: post.title }).then((tags) => {
      setPending((prev) =>
        prev.map((pp) =>
          pp.id === post.id ? { ...pp, suggestedTags: tags, status: "review" } : pp,
        ),
      );
    });
  }, []);

  // Hydrate from localStorage once on the client.
  useEffect(() => {
    setNails(load(LS_NAILS, MOCK_NAILS));
    const savedPending = load<PendingPost[]>(LS_PENDING, []);
    setPending(savedPending);
    const savedImports = load(LS_IMPORTS, 0);
    importCountRef.current = savedImports;
    setImportCount(savedImports);
    setHydrated(true);
    // Recover any posts left mid-analysis by a reload — re-run their tagging.
    savedPending.filter((p) => p.status === "analyzing").forEach(runTag);
  }, [runTag]);

  useEffect(() => {
    if (hydrated) save(LS_NAILS, nails);
  }, [nails, hydrated]);
  useEffect(() => {
    if (hydrated) save(LS_PENDING, pending);
  }, [pending, hydrated]);
  useEffect(() => {
    if (hydrated) save(LS_IMPORTS, importCount);
  }, [importCount, hydrated]);

  // Real import: paste an Instagram post URL -> backend fetches the image.
  const importFromUrl = useCallback(
    async (url: string): Promise<ImportOutcome> => {
      let res: Response;
      try {
        res = await fetch("/api/instagram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
      } catch {
        return { ok: false, error: "Network error. Is the server running?" };
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.error ?? "Couldn't import this post." };
      }

      const post: PendingPost = {
        id: `igurl-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
        title: titleFromCaption(data.caption ?? "", data.handle ?? "instagram"),
        source: { platform: "instagram", handle: data.handle, url: data.permalink },
        imageUrl: data.imageUrl,
        caption: data.caption,
        suggestedTags: {},
        status: "analyzing",
      };
      setPending((prev) => [post, ...prev]);
      runTag(post);
      return { ok: true };
    },
    [runTag],
  );

  // Real import: pull recent posts from a whole profile (Apify scraper).
  const importProfile = useCallback(
    async (url: string, limit?: number): Promise<ImportOutcome> => {
      let res: Response;
      try {
        res = await fetch("/api/instagram/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, limit }),
        });
      } catch {
        return { ok: false, error: "Network error. Is the server running?" };
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { ok: false, error: data.error ?? "Couldn't import this profile." };
      }

      type ApiPost = {
        shortcode?: string;
        imageUrl: string;
        caption?: string;
        handle?: string;
        permalink?: string;
      };
      const posts: ApiPost[] = data.posts ?? [];
      if (posts.length === 0) return { ok: false, error: "No photos found for that account." };

      // Stable id per Instagram post so re-importing the same post is detected.
      const idFor = (p: ApiPost, i: number) =>
        p.shortcode ? `ig-${p.shortcode}` : `ig-${p.permalink ?? p.imageUrl ?? i}`;

      // Skip posts already published (nails) or already queued (pending).
      // Match on both id and permalink so it also catches anything imported
      // under the older id scheme.
      const existing = new Set([
        ...nailsRef.current.flatMap((n) => [n.id, n.source.url]),
        ...pendingRef.current.flatMap((p) => [p.id, p.source.url]),
      ]);

      const fresh = posts.filter(
        (p, i) => !existing.has(idFor(p, i)) && !existing.has(p.permalink ?? ""),
      );
      const skipped = posts.length - fresh.length;

      if (fresh.length === 0) {
        return { ok: true, count: 0, skipped };
      }

      const newPosts: PendingPost[] = fresh.map((p, i) => ({
        id: idFor(p, i),
        title: titleFromCaption(p.caption ?? "", p.handle ?? "instagram"),
        source: {
          platform: "instagram",
          handle: p.handle ?? "instagram",
          url: p.permalink ?? url,
        },
        imageUrl: p.imageUrl,
        caption: p.caption,
        suggestedTags: {},
        status: "analyzing",
      }));
      setPending((prev) => [...newPosts, ...prev]);
      newPosts.forEach(runTag);
      return { ok: true, count: newPosts.length, skipped };
    },
    [runTag],
  );

  // Mock import: load sample posts (offline demo / fallback when no URL).
  const importSamplePosts = useCallback(() => {
    const batchIndex = importCountRef.current;
    importCountRef.current = batchIndex + 1;
    const start = batchIndex * IMPORT_BATCH;
    // Cycle through the mock pool indefinitely; suffix ids so they stay unique.
    const newPosts: PendingPost[] = Array.from({ length: IMPORT_BATCH }, (_, i) => {
      const base = INSTAGRAM_POOL[(start + i) % INSTAGRAM_POOL.length];
      const uid = `${base.id}-${start + i}`;
      return {
        id: uid,
        title: base.title,
        source: { ...base.source, url: `${base.source.url}-${start + i}` },
        suggestedTags: {},
        status: "analyzing",
      };
    });
    setPending((prev) => [...newPosts, ...prev]);
    setImportCount(importCountRef.current);
    newPosts.forEach(runTag);
  }, [runTag]);

  const approve = useCallback((post: PendingPost, title: string, tags: NailTags) => {
    const nail: Nail = {
      id: post.id,
      title,
      ...tags,
      imageUrl: post.imageUrl,
      source: post.source,
    };
    // Guard makes this idempotent (StrictMode double-invoke won't duplicate).
    setNails((ns) => (ns.some((n) => n.id === nail.id) ? ns : [nail, ...ns]));
    setPending((prev) => prev.filter((p) => p.id !== post.id));
  }, []);

  const approveAll = useCallback((): number => {
    const ready = pendingRef.current.filter((p) => p.status === "review");
    if (ready.length === 0) return 0;
    const newNails: Nail[] = ready.map((post) => ({
      id: post.id,
      title: post.title,
      ...completeTags(post.suggestedTags),
      imageUrl: post.imageUrl,
      source: post.source,
    }));
    setNails((ns) => {
      const have = new Set(ns.map((n) => n.id));
      return [...newNails.filter((n) => !have.has(n.id)), ...ns];
    });
    setPending((prev) => prev.filter((p) => p.status !== "review"));
    return ready.length;
  }, []);

  const reject = useCallback((id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      nails,
      pending,
      importFromUrl,
      importProfile,
      importSamplePosts,
      approve,
      approveAll,
      reject,
    }),
    [nails, pending, importFromUrl, importProfile, importSamplePosts, approve, approveAll, reject],
  );

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryContextValue {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error("useLibrary must be used within AppProviders");
  return ctx;
}

// ── Favorites ───────────────────────────────────────────────────────────────

type FavoritesContextValue = {
  favorites: string[];
  isFavorite: (id: string) => boolean;
  toggleFavorite: (id: string) => void;
};

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [favorites, setFavorites] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setFavorites(load(LS_FAVS, []));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) save(LS_FAVS, favorites);
  }, [favorites, hydrated]);

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const isFavorite = useCallback((id: string) => favorites.includes(id), [favorites]);

  const value = useMemo(
    () => ({ favorites, isFavorite, toggleFavorite }),
    [favorites, isFavorite, toggleFavorite],
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesContextValue {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within AppProviders");
  return ctx;
}

// ── Combined provider ────────────────────────────────────────────────────────

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <LibraryProvider>
      <FavoritesProvider>{children}</FavoritesProvider>
    </LibraryProvider>
  );
}
