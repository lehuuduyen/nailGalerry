import { NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/instagram/profile  { url|username, limit }
//    -> { posts: [{ imageUrl, caption, handle, permalink }] }
//
//  Pulls recent posts from a public Instagram PROFILE via the Apify Instagram
//  scraper. Instagram blocks reading arbitrary accounts directly, so a scraper
//  service is the realistic path for inspiration accounts you don't own.
//
//  Requires APIFY_TOKEN. Get one at https://console.apify.com (Settings → API).
// ─────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
// Scraping a profile can take a while; allow a generous window.
export const maxDuration = 120;

type ProfilePost = {
  imageUrl: string;
  caption: string;
  handle: string;
  permalink: string;
};

const RESERVED = new Set(["p", "reel", "reels", "tv", "explore", "stories", "s"]);

/** Accept a profile URL, "@handle", or bare "handle" -> canonical profile URL. */
function toProfileUrl(raw: string): { url: string; username: string } | null {
  let s = raw.trim();
  if (!s) return null;

  if (/^@?[\w.]+$/.test(s)) {
    const username = s.replace(/^@/, "");
    return { url: `https://www.instagram.com/${username}/`, username };
  }
  try {
    const u = new URL(s);
    if (!/instagram\.com$/i.test(u.hostname.replace(/^www\./, ""))) return null;
    const seg = u.pathname.split("/").filter(Boolean);
    if (seg.length !== 1 || RESERVED.has(seg[0].toLowerCase())) return null;
    return { url: `https://www.instagram.com/${seg[0]}/`, username: seg[0] };
  } catch {
    return null;
  }
}

type ApifyItem = {
  type?: string;
  shortCode?: string;
  caption?: string;
  url?: string;
  displayUrl?: string;
  images?: string[];
  ownerUsername?: string;
};

export async function POST(req: Request) {
  let body: { url?: string; username?: string; limit?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const profile = toProfileUrl(body.url ?? body.username ?? "");
  if (!profile) {
    return NextResponse.json(
      { error: "Paste an Instagram profile URL or @username." },
      { status: 400 },
    );
  }

  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        error:
          "Profile import needs an Apify API token. Set APIFY_TOKEN in .env.local " +
          "(get one free at console.apify.com).",
      },
      { status: 501 },
    );
  }

  const limit = Math.min(Math.max(body.limit ?? 12, 1), 30);

  const endpoint =
    "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items" +
    `?token=${encodeURIComponent(token)}`;

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directUrls: [profile.url],
        resultsType: "posts",
        resultsLimit: limit,
        searchType: "user",
        addParentData: false,
      }),
      signal: AbortSignal.timeout(110_000),
    });
  } catch {
    return NextResponse.json(
      { error: "The scrape timed out or failed to reach Apify. Try a smaller limit." },
      { status: 504 },
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return NextResponse.json(
      {
        error:
          res.status === 401
            ? "Apify rejected the token. Check APIFY_TOKEN."
            : `Apify error (${res.status}). ${detail.slice(0, 140)}`,
      },
      { status: 502 },
    );
  }

  const items = (await res.json().catch(() => [])) as ApifyItem[];

  const posts: ProfilePost[] = items
    .map((it) => {
      const imageUrl = it.displayUrl ?? it.images?.[0];
      if (!imageUrl) return null;
      return {
        imageUrl,
        caption: it.caption ?? "",
        handle: it.ownerUsername ?? profile.username,
        permalink: it.url ?? `${profile.url}p/${it.shortCode ?? ""}/`,
      };
    })
    .filter((p): p is ProfilePost => p !== null);

  if (posts.length === 0) {
    return NextResponse.json(
      { error: "No photos found — the account may be private or empty." },
      { status: 404 },
    );
  }

  return NextResponse.json({ posts, username: profile.username });
}
