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
import { isInstagramCdn } from "./img";
import { INSTAGRAM_POOL } from "./mock-data";
import type { Nail, NailTags, TagKey } from "./types";

/**
 * Persist an Instagram image to our storage (R2) so it survives the IG link
 * expiry. Returns the permanent URL, or the original if storage isn't set up
 * or the image isn't an Instagram CDN URL. Never throws.
 */
async function persistImage(url?: string): Promise<string | undefined> {
  if (!url || !isInstagramCdn(url)) return url;
  try {
    const res = await fetch("/api/store-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ src: url }),
    });
    const data = await res.json().catch(() => ({}));
    return data.url ?? url;
  } catch {
    return url;
  }
}

/** Fill every tag group, falling back to the first value if AI left one blank. */
function completeTags(suggested: Partial<NailTags>): NailTags {
  const tags = {} as NailTags;
  for (const g of TAG_GROUPS) tags[g.key as TagKey] = suggested[g.key as TagKey] ?? g.values[0];
  return tags;
}

// The whole catalog (pending + approved) lives on R2 (see /api/catalog) so it's
// shared across browsers. Only the import counter stays in localStorage.
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

// ── Library (catalog of designs, each pending or approved) ───────────────────

type ImportOutcome = { ok: boolean; error?: string; count?: number; skipped?: number };

type LibraryContextValue = {
  /** Every catalog item — the admin sees both pending and approved. */
  nails: Nail[];
  /** Approved items only — what visitors see in the public gallery. */
  published: Nail[];
  /** Import a single post by URL: uploads the image to R2, adds it as pending. */
  importFromUrl: (url: string) => Promise<ImportOutcome>;
  /** Import recent posts from a profile: uploads images to R2, adds as pending. */
  importProfile: (url: string, limit?: number) => Promise<ImportOutcome>;
  /** Load demo sample designs as pending (offline demo). */
  importSamplePosts: () => void;
  /** Run Gemini auto-tagging on every pending design. Returns how many. */
  tagPending: () => Promise<number>;
  /** Approve one pending design — makes it visible to visitors. */
  approveNail: (id: string) => void;
  /** Approve every pending design. Returns how many. */
  approveAllPending: () => number;
  /** Edit a design's title/tags and persist to R2. */
  updateNail: (id: string, patch: Partial<Nail>) => void;
  /** Delete a design — removes it from the catalog and from R2. */
  removeNail: (id: string) => void;
  /** Delete several designs at once (catalog + R2). */
  removeMany: (ids: string[]) => void;
  /** Wipe the whole catalog (and favorites) for a fresh start. */
  clearLibrary: () => void;
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
  const [nails, setNails] = useState<Nail[]>([]);
  // How many demo import batches have run — keeps generated ids unique.
  const [importCount, setImportCount] = useState(0);
  const importCountRef = useRef(0);
  const [hydrated, setHydrated] = useState(false);

  // Mirror for reads inside callbacks without stale closures.
  const nailsRef = useRef<Nail[]>([]);
  useEffect(() => {
    nailsRef.current = nails;
  }, [nails]);

  // Hydrate: the import counter from localStorage, the catalog from R2.
  useEffect(() => {
    const savedImports = load(LS_IMPORTS, 0);
    importCountRef.current = savedImports;
    setImportCount(savedImports);
    setHydrated(true);
    fetch("/api/catalog")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.nails)) setNails(d.nails as Nail[]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (hydrated) save(LS_IMPORTS, importCount);
  }, [importCount, hydrated]);

  // Persist the catalog to R2 so every browser sees the same thing.
  const saveCatalog = useCallback((next: Nail[]) => {
    nailsRef.current = next;
    fetch("/api/catalog", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nails: next }),
    }).catch(() => {});
  }, []);

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
      if (!res.ok) return { ok: false, error: data.error ?? "Couldn't import this post." };

      // Upload to R2 now (no Gemini); land it as pending for admin approval.
      const imageUrl = await persistImage(data.imageUrl);
      const nail: Nail = {
        id: `igurl-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
        title: titleFromCaption(data.caption ?? "", data.handle ?? "instagram"),
        ...completeTags({}),
        imageUrl,
        caption: data.caption,
        source: {
          platform: "instagram",
          handle: data.handle ?? "instagram",
          url: data.permalink ?? url,
        },
        status: "pending",
      };
      const next = [nail, ...nailsRef.current];
      setNails(next);
      saveCatalog(next);
      return { ok: true, count: 1 };
    },
    [saveCatalog],
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
      if (!res.ok) return { ok: false, error: data.error ?? "Couldn't import this profile." };

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

      const existing = new Set(nailsRef.current.flatMap((n) => [n.id, n.source.url]));
      const fresh = posts.filter(
        (p, i) => !existing.has(idFor(p, i)) && !existing.has(p.permalink ?? ""),
      );
      const skipped = posts.length - fresh.length;
      if (fresh.length === 0) return { ok: true, count: 0, skipped };

      // Upload every image to R2 now (while the IG links are fresh), no Gemini —
      // they land as pending; tag/approve them later from the admin.
      const newNails: Nail[] = await Promise.all(
        fresh.map(async (p, i) => ({
          id: idFor(p, i),
          title: titleFromCaption(p.caption ?? "", p.handle ?? "instagram"),
          ...completeTags({}),
          imageUrl: await persistImage(p.imageUrl),
          caption: p.caption,
          source: {
            platform: "instagram" as const,
            handle: p.handle ?? "instagram",
            url: p.permalink ?? url,
          },
          status: "pending" as const,
        })),
      );
      const next = [...newNails, ...nailsRef.current];
      setNails(next);
      saveCatalog(next);
      return { ok: true, count: newNails.length, skipped };
    },
    [saveCatalog],
  );

  // Mock import: load sample designs as pending (offline demo when no URL).
  const importSamplePosts = useCallback(() => {
    const batchIndex = importCountRef.current;
    importCountRef.current = batchIndex + 1;
    const start = batchIndex * IMPORT_BATCH;
    const newNails: Nail[] = Array.from({ length: IMPORT_BATCH }, (_, i) => {
      const base = INSTAGRAM_POOL[(start + i) % INSTAGRAM_POOL.length];
      return {
        id: `${base.id}-${start + i}`,
        title: base.title,
        ...completeTags({}),
        source: { ...base.source, url: `${base.source.url}-${start + i}` },
        status: "pending" as const,
      };
    });
    const next = [...newNails, ...nailsRef.current];
    setNails(next);
    setImportCount(importCountRef.current);
    saveCatalog(next);
  }, [saveCatalog]);

  // Run Gemini auto-tagging on every pending design at once.
  const tagPending = useCallback(async (): Promise<number> => {
    const pendingNails = nailsRef.current.filter((n) => n.status === "pending");
    if (pendingNails.length === 0) return 0;
    const tagged = await Promise.all(
      pendingNails.map(async (n) => ({
        id: n.id,
        tags: await autoTagImage({ title: n.title, imageUrl: n.imageUrl, caption: n.caption }),
      })),
    );
    const byId = new Map(tagged.map((t) => [t.id, t.tags]));
    const next = nailsRef.current.map((n) =>
      byId.has(n.id) ? { ...n, ...completeTags(byId.get(n.id)!) } : n,
    );
    setNails(next);
    saveCatalog(next);
    return pendingNails.length;
  }, [saveCatalog]);

  const approveNail = useCallback(
    (id: string) => {
      const next = nailsRef.current.map((n) =>
        n.id === id ? { ...n, status: "approved" as const } : n,
      );
      setNails(next);
      saveCatalog(next);
    },
    [saveCatalog],
  );

  const approveAllPending = useCallback((): number => {
    const count = nailsRef.current.filter((n) => n.status === "pending").length;
    if (count === 0) return 0;
    const next = nailsRef.current.map((n) =>
      n.status === "pending" ? { ...n, status: "approved" as const } : n,
    );
    setNails(next);
    saveCatalog(next);
    return count;
  }, [saveCatalog]);

  const updateNail = useCallback(
    (id: string, patch: Partial<Nail>) => {
      const next = nailsRef.current.map((n) => (n.id === id ? { ...n, ...patch } : n));
      setNails(next);
      saveCatalog(next);
    },
    [saveCatalog],
  );

  // Delete the underlying R2 image for a nail (no-op if it's not an R2 url).
  const deleteImage = (url?: string) => {
    if (!url) return;
    fetch("/api/store-image", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    }).catch(() => {});
  };

  const removeNail = useCallback(
    (id: string) => {
      const target = nailsRef.current.find((n) => n.id === id);
      const next = nailsRef.current.filter((n) => n.id !== id);
      setNails(next);
      saveCatalog(next);
      deleteImage(target?.imageUrl);
    },
    [saveCatalog],
  );

  const removeMany = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      const targets = nailsRef.current.filter((n) => idSet.has(n.id));
      if (targets.length === 0) return;
      const next = nailsRef.current.filter((n) => !idSet.has(n.id));
      setNails(next);
      saveCatalog(next);
      targets.forEach((t) => deleteImage(t.imageUrl));
    },
    [saveCatalog],
  );

  // Reset everything to a clean slate (empty catalog written to R2, and the
  // underlying images deleted from R2 too).
  const clearLibrary = useCallback(() => {
    const current = nailsRef.current;
    setNails([]);
    setImportCount(0);
    importCountRef.current = 0;
    if (typeof window !== "undefined") window.localStorage.removeItem(LS_FAVS);
    saveCatalog([]);
    current.forEach((n) => deleteImage(n.imageUrl));
  }, [saveCatalog]);

  const published = useMemo(() => nails.filter((n) => n.status !== "pending"), [nails]);

  const value = useMemo(
    () => ({
      nails,
      published,
      importFromUrl,
      importProfile,
      importSamplePosts,
      tagPending,
      approveNail,
      approveAllPending,
      updateNail,
      removeNail,
      removeMany,
      clearLibrary,
    }),
    [
      nails,
      published,
      importFromUrl,
      importProfile,
      importSamplePosts,
      tagPending,
      approveNail,
      approveAllPending,
      updateNail,
      removeNail,
      removeMany,
      clearLibrary,
    ],
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
