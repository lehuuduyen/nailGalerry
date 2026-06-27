import { NextResponse } from "next/server";
import { classifyNailImage } from "@/lib/autotag";
import { countUntaggedPending, getUntaggedPending, isDbConfigured, updateDesignTags } from "@/lib/db";
import { tagConfig } from "@/lib/gemini";

// ─────────────────────────────────────────────────────────────────────────
//  POST /api/auto-tag/batch  { limit?, exclude? }  ->  { processed, tagged,
//                                                        failed, remaining }
//
//  Bulk auto-tags PENDING designs with Gemini and writes the tags straight to
//  Neon. It processes ONE small chunk per request (default 8) with bounded
//  concurrency, so each invocation finishes well inside the serverless time
//  budget. The admin client calls it in a loop until `remaining` hits 0,
//  passing back the ids it has already attempted (so failures aren't retried
//  forever and successes — which set alt_text — drop out naturally).
//
//  Admin-only: gated by proxy.ts (Basic auth) alongside the other write APIs.
// ─────────────────────────────────────────────────────────────────────────

export const runtime = "nodejs";
export const maxDuration = 60;

// Each request tags one wave of CHUNK designs CONCURRENCY-at-a-time. Keeping
// CHUNK == CONCURRENCY means ~one Gemini round-trip per request (~5–6s), which
// stays under tight serverless limits (e.g. Vercel hobby ~10s); the client just
// loops more times. Bump these together if your plan allows longer functions.
const DEFAULT_CHUNK = 6;
const MAX_CHUNK = 16;
const CONCURRENCY = 6;

/** Run `worker` over `items` with at most `n` in flight at once. */
async function pool<T, R>(items: T[], n: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, run));
  return results;
}

export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 501 });
  }
  if (!tagConfig().apiKey) {
    return NextResponse.json({ error: "Gemini is not configured." }, { status: 501 });
  }

  let body: { limit?: number; exclude?: string[] };
  try {
    body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const limit = Math.min(MAX_CHUNK, Math.max(1, body.limit ?? DEFAULT_CHUNK));
  const exclude = Array.isArray(body.exclude) ? body.exclude.filter((x) => typeof x === "string") : [];

  const chunk = await getUntaggedPending(limit, exclude).catch(() => []);

  const outcomes = await pool(chunk, CONCURRENCY, async (n) => {
    if (!n.imageUrl) return false;
    const result = await classifyNailImage({ imageUrl: n.imageUrl, caption: n.caption });
    if (!result) return false;
    try {
      await updateDesignTags(n.id, result);
      return true;
    } catch {
      return false;
    }
  });

  const tagged = outcomes.filter(Boolean).length;
  const failed = outcomes.length - tagged;
  const processedIds = chunk.map((n) => n.id);
  // Remaining still needing tags AFTER this chunk, minus anything we attempted
  // but couldn't tag (those keep alt_text NULL but the client now excludes them).
  const stillUntagged = await countUntaggedPending().catch(() => 0);
  const remaining = Math.max(0, stillUntagged - failed);

  return NextResponse.json({ processed: chunk.length, tagged, failed, remaining, processedIds });
}
