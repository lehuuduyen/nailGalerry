# Perf notes — image CDN + Home caching + lazy load

Goal: 2nd+ image views served from CDN cache (fewer R2 Class B ops + bandwidth),
Home cached at the app layer, images right-sized and lazy-loaded. Small,
rollback-able changes; migrate/enrich pipeline untouched.

## What changed (files)

**Image serving (Task 2 + 5)**
- `lib/imageUrl.ts` (new) — `resolveImageSrc(url, {width})`: rewrites stored
  `*.r2.dev` URLs to `NEXT_PUBLIC_IMAGE_BASE`; when `NEXT_PUBLIC_IMAGE_RESIZE=1`
  adds Cloudflare `/cdn-cgi/image/width=…,format=auto/` for ~400px WebP/AVIF.
  Falls back to the original URL (or the Instagram proxy) when unset.
- `components/GradientThumb.tsx` — uses `resolveImageSrc`, adds `loading="lazy"`
  + `decoding="async"`, new optional `width` hint. Aspect ratio comes from the
  caller's class (no CLS).
- `components/NailCard.tsx` — passes `width={400}` and `alt={altText ?? title}`.
- `app/nail/[id]/page.tsx` — detail image `width={800}`, `alt` from `altText`.
- `next.config.ts` — `images.remotePatterns` for `*.r2.dev` + the
  `NEXT_PUBLIC_IMAGE_BASE` host (for future `next/image`); still `unoptimized`
  (we serve via `<img>` + Cloudflare, not the Vercel optimizer).

**Home caching (Task 3)**
- Home already reads designs from **Neon** (via `useLibrary` → `GET /api/catalog`),
  not `catalog.json` on R2.
- `GET /api/catalog` now sends `Cache-Control: public, s-maxage=300,
  stale-while-revalidate=600` (CDN-cached 5 min). `lib/store.tsx` `refresh()` no
  longer uses `cache:"no-store"`, so repeat Home visits hit the cache; like
  counts refresh within ~5 min (instant locally via optimistic update).
- `app/api/designs/route.ts` (new) — cursor-paginated, approved-only feed with
  only card/filter columns (no heavy `description`), same cache header. Cursor =
  `(created_at, id)` (stable as rows are added). Ready for infinite scroll.
- Note: Home is a client component, so a page-level `export const revalidate`
  wouldn't apply to its client-fetched data — caching is done via the response
  `Cache-Control` instead (same effect at the CDN).

**Lazy load / CLS (Task 4)**
- All card/detail images now `loading="lazy"`; grid keeps fixed `aspect-[4/5]`
  so there's no layout shift. Catalog is small (37) so Home still loads all and
  filters client-side; the cursor API is in place for infinite scroll later
  (would also need filters moved server-side).

**DB layer**
- `lib/db.ts` — `rowToNail` now maps `slug` + `alt_text`; added `getDesignsPage`.
- `lib/types.ts` — `Nail` gains `slug?` and `altText?`.

## New env vars to set in Vercel

| var | value | when |
|---|---|---|
| `NEXT_PUBLIC_IMAGE_BASE` | `https://img.yourdomain.com` | after CDN_SETUP step 1 |
| `NEXT_PUBLIC_IMAGE_RESIZE` | `1` | only after CDN_SETUP step 3 (resizing verified) |

(`NEXT_PUBLIC_*` are build-time inlined → redeploy after changing.)
`DATABASE_URL` must already be set in Vercel for Home to read Neon.

## Manual steps remaining

See **CDN_SETUP.md**: connect `img.yourdomain.com` to the R2 bucket, (optionally)
enable Image Resizing, set the env vars, and verify `cf-cache-status: HIT`.

## How to measure the Class B drop (after 24–48h)

1. Cloudflare → **R2** → bucket **nailgallery** → **Metrics**: watch **Class B
   operations** (object reads). After traffic shifts to the cached custom domain,
   Class B should fall sharply (repeat views become CDN `HIT`s, not R2 reads).
2. Cloudflare → zone **Analytics → Caching**: cache hit ratio for
   `img.yourdomain.com` should be high.
3. Spot check: `curl -sI .../cdn-cgi/image/.../<key>` twice → second is
   `cf-cache-status: HIT`.
4. Compare R2 Class B daily totals before vs 24–48h after enabling the domain.

## Rollback

Unset `NEXT_PUBLIC_IMAGE_BASE` / `NEXT_PUBLIC_IMAGE_RESIZE` and redeploy →
images serve from `r2.dev` again. The cache headers and lazy-loading are safe to
keep regardless.
