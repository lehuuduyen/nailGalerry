# CDN setup — serve R2 images through a custom domain (manual steps)

The code is ready: it rewrites stored `*.r2.dev` image URLs to
`NEXT_PUBLIC_IMAGE_BASE` and (optionally) Cloudflare Image Resizing. These steps
are done **by you** in the Cloudflare dashboard — Claude can't do them.

## 1. Point a subdomain at the R2 bucket

1. Cloudflare dashboard → **R2** → bucket **`nailgallery`** → **Settings** →
   **Custom Domains** → **Connect Domain**.
2. Enter a subdomain on a domain you manage in Cloudflare, e.g.
   **`img.yourdomain.com`**. Cloudflare adds the DNS record automatically.
3. Wait until status is **Active** (TLS issued). Test:
   `https://img.yourdomain.com/<an existing key>` should load an image.
   - Find a key from the DB, e.g. `nails/1mdzpsw-….jpg` or `uploads/….jpg`
     (the part of the current `*.r2.dev/...` URL after the host).

## 2. Make sure caching is on

- Custom-domain R2 objects are cached by Cloudflare's CDN by default. Our app
  already uploads images with `Cache-Control: public, max-age=31536000, immutable`,
  so they cache well.
- (Optional) Cloudflare → **Caching** → ensure standard caching is enabled for
  the zone. A **Cache Rule** for `img.yourdomain.com/*` with "Eligible for cache"
  can make it explicit.

## 3. (Optional) Enable Cloudflare Image Resizing

This serves cards as ~400px WebP/AVIF instead of the 1080px original.

1. Cloudflare → your zone → **Speed → Optimization → Image Resizing** (a.k.a.
   "Images → Transformations") → **enable Resizing for this zone**.
   (Requires a plan that includes resizing/transformations.)
2. Verify a transform works:
   `https://img.yourdomain.com/cdn-cgi/image/width=400,format=auto/<key>`
   should return a smaller, WebP/AVIF version.
3. Only after this works, set `NEXT_PUBLIC_IMAGE_RESIZE=1` (see step 4).

## 4. Set env vars (local `.env.local` + Vercel project settings)

```
NEXT_PUBLIC_IMAGE_BASE=https://img.yourdomain.com
NEXT_PUBLIC_IMAGE_RESIZE=        # leave blank until step 3 verified, then set to 1
```

- Add the same in **Vercel → Project → Settings → Environment Variables**
  (Production + Preview), then redeploy. `NEXT_PUBLIC_*` are inlined at build, so
  a redeploy is required for changes to take effect.
- With `NEXT_PUBLIC_IMAGE_BASE` blank, the app keeps using the `r2.dev` URLs, so
  nothing breaks before you finish setup.

## 5. Verify images go through the CDN

```bash
# Replace with a real card image URL from the page (Network tab) or a known key.
curl -sI "https://img.yourdomain.com/cdn-cgi/image/width=400,format=auto/nails/<key>.jpg" \
  | grep -i -E "cf-cache-status|content-type|age"
```

- First request: `cf-cache-status: MISS`. Request again → **`cf-cache-status: HIT`**.
- `content-type: image/webp` (or avif) confirms resizing/format=auto is working.
- A `HIT` means the second view is served from Cloudflare's edge — **no R2
  Class B op and no origin bandwidth**.

## 6. (Optional) Lock down the public r2.dev URL

Once the custom domain serves everything, you can reduce direct `r2.dev` exposure:

- R2 → bucket → Settings → **Public Development URL** → you may **disable** it
  (the app no longer needs it once `NEXT_PUBLIC_IMAGE_BASE` is set and deployed).
- ⚠️ Only disable after confirming the site uses the custom domain in production,
  and after re-checking any old links. Keep it during the transition.

## Rollback

Unset `NEXT_PUBLIC_IMAGE_BASE` (and `NEXT_PUBLIC_IMAGE_RESIZE`) and redeploy —
the app reverts to serving images from `r2.dev`.
