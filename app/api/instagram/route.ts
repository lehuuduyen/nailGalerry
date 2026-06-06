import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/instagram  { url }  ->  { imageUrl, caption, handle, permalink }
//
//  Fetches a single public Instagram post's image from a pasted URL.
//   1. If INSTAGRAM_OEMBED_TOKEN is set, use the official oEmbed endpoint
//      (reliable, allowed for public content).
//   2. Otherwise fall back to scraping the post page's Open Graph tags.
//      This works for many public posts but Instagram may rate-limit or
//      login-wall server requests — set a token for production reliability.
// ─────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";

type ImportResult = {
  imageUrl: string;
  caption: string;
  handle: string;
  permalink: string;
};

const IG_URL_RE = /^https?:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[\w-]+\/?/i;
const IG_USER_POST_RE = /^https?:\/\/(www\.)?instagram\.com\/([\w.]+)\/(p|reel|tv)\/[\w-]+/i;
const SHORTCODE_RE = /\/(p|reel|tv)\/([\w-]+)/i;

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function unescapeUrl(s: string): string {
  return s.replace(/\\u0026/g, "&").replace(/\\\//g, "/").replace(/\\/g, "");
}

function normalize(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (!/instagram\.com$/i.test(u.hostname.replace(/^www\./, ""))) return null;
    // Strip query/hash so it matches the canonical post URL.
    return `${u.origin}${u.pathname}`;
  } catch {
    return null;
  }
}

function metaContent(html: string, property: string): string | undefined {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(re);
  return m?.[1];
}

function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function handleFromUrl(url: string): string | undefined {
  const m = url.match(IG_USER_POST_RE);
  return m?.[2];
}

async function viaOEmbed(url: string, token: string): Promise<ImportResult | null> {
  const endpoint =
    `https://graph.facebook.com/v19.0/instagram_oembed` +
    `?url=${encodeURIComponent(url)}&fields=thumbnail_url,author_name,title&access_token=${token}`;
  const res = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    thumbnail_url?: string;
    author_name?: string;
    title?: string;
  };
  if (!data.thumbnail_url) return null;
  return {
    imageUrl: data.thumbnail_url,
    caption: data.title ?? "",
    handle: data.author_name ?? handleFromUrl(url) ?? "instagram",
    permalink: url,
  };
}

/**
 * Fetch Instagram's PUBLIC embed page (designed for login-free embedding) and
 * extract the post's image + caption + author. This is the most reliable
 * no-token path: the embed endpoint returns 200 to servers where the normal
 * post page login-walls.
 */
async function viaEmbed(url: string): Promise<ImportResult | null> {
  const sc = url.match(SHORTCODE_RE);
  if (!sc) return null;
  const embedUrl = `https://www.instagram.com/${sc[1]}/${sc[2]}/embed/captioned/`;

  const res = await fetch(embedUrl, {
    headers: { "User-Agent": BROWSER_UA, "Accept-Language": "en-US,en;q=0.9" },
    signal: AbortSignal.timeout(8000),
    redirect: "follow",
  });
  if (!res.ok) return null;
  const html = await res.text();

  // The post photo appears either as the EmbeddedMediaImage <img> or inside
  // inline JSON as display_url. Try several patterns, ignoring static assets.
  let image: string | undefined;
  const imgTag = html.match(/class="EmbeddedMediaImage"[^>]*\ssrc="([^"]+)"/i);
  if (imgTag) image = imgTag[1].replace(/&amp;/g, "&");
  if (!image) {
    const json = html.match(/"display_url":"(https:[^"]+?)"/);
    if (json) image = unescapeUrl(json[1]);
  }
  if (!image) {
    // Any scontent CDN image referenced in the page (post media is hosted there).
    const scontent = html.match(/"(https:\\?\/\\?\/scontent[^"]+?)"/);
    if (scontent) image = unescapeUrl(scontent[1]);
  }
  if (!image) return null;

  const userMatch =
    html.match(/"username":"([^"]+)"/) ||
    html.match(/class="UsernameText"[^>]*>([^<]+)</i);
  const captionMatch = html.match(/class="Caption"[\s\S]*?<\/div>/i);
  const caption = captionMatch
    ? captionMatch[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
    : "";

  return {
    imageUrl: image,
    caption: decodeEntities(caption),
    handle: userMatch?.[1] ?? handleFromUrl(url) ?? "instagram",
    permalink: url,
  };
}

async function viaOgScrape(url: string): Promise<ImportResult | null> {
  const res = await fetch(url, {
    headers: {
      // Look like a real browser so Instagram serves the OG meta tags.
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(8000),
    redirect: "follow",
  });
  if (!res.ok) return null;
  const html = await res.text();

  const image = metaContent(html, "og:image");
  if (!image) return null;

  const title = metaContent(html, "og:title") ?? "";
  const description = metaContent(html, "og:description") ?? "";
  // og:title is usually "Username on Instagram: caption…"
  const handleMatch = decodeEntities(title).match(/^([\w.]+)\s+on Instagram/i);

  return {
    imageUrl: decodeEntities(image),
    caption: decodeEntities(description || title),
    handle: handleMatch?.[1] ?? handleFromUrl(url) ?? "instagram",
    permalink: url,
  };
}

const IMG_EXT_RE = /\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i;
const IMG_HOST_RE = /(cdninstagram\.com|fbcdn\.net)$/i;

/** Treat a pasted link as a direct image (extension, IG CDN host, or image/* HEAD). */
async function asDirectImage(raw: string): Promise<ImportResult | null> {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;

  let looksLikeImage = IMG_EXT_RE.test(u.pathname) || IMG_HOST_RE.test(u.hostname);
  if (!looksLikeImage) {
    try {
      const head = await fetch(raw, { method: "HEAD", signal: AbortSignal.timeout(6000) });
      looksLikeImage = (head.headers.get("content-type") ?? "").startsWith("image/");
    } catch {
      return null;
    }
  }
  if (!looksLikeImage) return null;

  return {
    imageUrl: raw,
    caption: "",
    handle: IMG_HOST_RE.test(u.hostname) ? "instagram" : u.hostname.replace(/^www\./, ""),
    permalink: raw,
  };
}

export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const raw = (body.url ?? "").trim();
  const postUrl = normalize(raw);
  const isPostUrl = !!postUrl && IG_URL_RE.test(postUrl);

  try {
    // 1) Instagram post/reel URL -> oEmbed (token) -> embed page -> OG tags.
    if (isPostUrl && postUrl) {
      const token = process.env.INSTAGRAM_OEMBED_TOKEN;
      let result: ImportResult | null = null;
      if (token) result = await viaOEmbed(postUrl, token);
      if (!result) result = await viaEmbed(postUrl);
      if (!result) result = await viaOgScrape(postUrl);
      if (result) return NextResponse.json(result);

      // Scraping is blocked by Instagram without a token — guide the user.
      return NextResponse.json(
        {
          error:
            "Instagram blocked fetching this post server-side. Either add an " +
            "INSTAGRAM_OEMBED_TOKEN, or right-click the photo → “Copy image address” and paste " +
            "that direct image link here.",
        },
        { status: 502 },
      );
    }

    // 2) A direct image link (e.g. copied IG photo address) — always works.
    const direct = await asDirectImage(raw);
    if (direct) return NextResponse.json(direct);

    return NextResponse.json(
      { error: "Paste an Instagram post/reel URL, or a direct image link." },
      { status: 400 },
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch that link. Please try again." },
      { status: 502 },
    );
  }
}
