import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { closePool, pool } from "./db";
import { getJsonArray, isOnR2, putObject } from "./r2";

// ─────────────────────────────────────────────────────────────────────────
//  migrate.ts — copy users + designs from R2 JSON files into Neon Postgres.
//
//  - Users are inserted first (designs reference owner_id).
//  - For each design whose image is NOT already on R2, the image is downloaded
//    and re-hosted under designs/<id>.<ext>; image_url points at R2 and the old
//    URL is kept in original_url. A download failure is logged to
//    migrate/failed-images.json and the record is still inserted (keeping the
//    original URL) — one bad image never aborts the run.
//  - Everything uses ON CONFLICT (id) DO UPDATE so re-runs are idempotent.
//
//  Run:  npx tsx migrate/migrate.ts
// ─────────────────────────────────────────────────────────────────────────

const BATCH = 20;
const FETCH_TIMEOUT_MS = 20_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

type UserJson = {
  id: string;
  username: string;
  salt: string;
  passwordHash: string;
  createdAt?: number;
};

type SourceJson = { platform?: string; handle?: string; url?: string };

type DesignJson = {
  id: string;
  title?: string;
  style?: string;
  color?: string;
  shape?: string;
  length?: string;
  occasion?: string;
  mood?: string;
  technique?: string;
  detail?: string;
  imageUrl?: string;
  contributor?: string;
  ownerId?: string;
  source?: SourceJson;
  status?: string;
};

type ImageResult = { imageUrl: string; originalUrl: string | null; error?: string };
const failures: { id: string; originalUrl: string; error: string }[] = [];

/** Ensure a design's image lives on R2, re-hosting it if needed. Never throws. */
async function ensureOnR2(design: DesignJson): Promise<ImageResult> {
  const url = design.imageUrl;
  if (!url) return { imageUrl: "", originalUrl: null, error: "no imageUrl" };
  if (isOnR2(url)) return { imageUrl: url, originalUrl: null };

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const ct = (res.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    if (!res.ok || !ct.startsWith("image/")) throw new Error(`fetch ${res.status} (${ct})`);
    const buf = Buffer.from(await res.arrayBuffer());
    const key = `designs/${design.id}.${EXT[ct] ?? "jpg"}`;
    const r2url = await putObject(key, buf, ct);
    return { imageUrl: r2url, originalUrl: url };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    failures.push({ id: design.id, originalUrl: url, error: msg });
    // Keep the record alive with the original (possibly expiring) URL.
    return { imageUrl: url, originalUrl: url, error: msg };
  }
}

async function insertUsers(users: UserJson[]): Promise<number> {
  let n = 0;
  for (const u of users) {
    if (!u.id || !u.username || !u.passwordHash || !u.salt) {
      console.warn(`  ⚠ skipping malformed user: ${JSON.stringify(u.id ?? u)}`);
      continue;
    }
    await pool.query(
      `INSERT INTO users (id, username, password_hash, salt, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         username = EXCLUDED.username,
         password_hash = EXCLUDED.password_hash,
         salt = EXCLUDED.salt`,
      [u.id, u.username, u.passwordHash, u.salt, u.createdAt ? new Date(u.createdAt) : new Date()],
    );
    n++;
  }
  return n;
}

async function insertDesign(d: DesignJson, img: ImageResult, knownUserIds: Set<string>) {
  const ownerId = d.ownerId && knownUserIds.has(d.ownerId) ? d.ownerId : null;
  await pool.query(
    `INSERT INTO designs (
       id, title, style, color, shape, length, occasion, mood, technique, detail,
       image_url, original_url, contributor, owner_id,
       source_platform, source_handle, source_url, status
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18
     )
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       style = EXCLUDED.style,
       color = EXCLUDED.color,
       shape = EXCLUDED.shape,
       length = EXCLUDED.length,
       occasion = EXCLUDED.occasion,
       mood = EXCLUDED.mood,
       technique = EXCLUDED.technique,
       detail = EXCLUDED.detail,
       image_url = EXCLUDED.image_url,
       original_url = COALESCE(EXCLUDED.original_url, designs.original_url),
       contributor = EXCLUDED.contributor,
       owner_id = EXCLUDED.owner_id,
       source_platform = EXCLUDED.source_platform,
       source_handle = EXCLUDED.source_handle,
       source_url = EXCLUDED.source_url,
       status = EXCLUDED.status`,
    [
      d.id,
      d.title ?? null,
      d.style ?? null,
      d.color ?? null,
      d.shape ?? null,
      d.length ?? null,
      d.occasion ?? null,
      d.mood ?? null,
      d.technique ?? null,
      d.detail ?? null,
      img.imageUrl,
      img.originalUrl,
      d.contributor ?? null,
      ownerId,
      d.source?.platform ?? null,
      d.source?.handle ?? null,
      d.source?.url ?? null,
      d.status ?? "approved",
    ],
  );
}

async function main() {
  console.log("Loading JSON from R2…");
  const [catalog, users] = await Promise.all([
    getJsonArray<DesignJson>("catalog.json"),
    getJsonArray<UserJson>("users.json"),
  ]);
  console.log(`  catalog.json: ${catalog.length} designs`);
  console.log(`  users.json:   ${users.length} users`);

  console.log("\nInserting users…");
  const userCount = await insertUsers(users);
  console.log(`  ${userCount} users upserted.`);
  const knownUserIds = new Set(users.map((u) => u.id));

  console.log(`\nMigrating designs (batch ${BATCH}, re-hosting images as needed)…`);
  let done = 0;
  let rehosted = 0;
  for (let i = 0; i < catalog.length; i += BATCH) {
    const batch = catalog.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (d) => {
        const img = await ensureOnR2(d);
        if (img.originalUrl && !img.error) rehosted++;
        await insertDesign(d, img, knownUserIds);
      }),
    );
    done += batch.length;
    console.log(`  processed ${done}/${catalog.length}`);
  }

  // Persist the list of images we couldn't re-host for later retry.
  const failPath = resolve(process.cwd(), "migrate/failed-images.json");
  writeFileSync(failPath, JSON.stringify(failures, null, 2));

  console.log("\n──────── Summary ────────");
  console.log(`  Users upserted:        ${userCount}`);
  console.log(`  Designs upserted:      ${done}`);
  console.log(`  Images re-hosted:      ${rehosted}`);
  console.log(`  Image failures:        ${failures.length} (see migrate/failed-images.json)`);
}

main()
  .catch((err) => {
    console.error("migrate failed:", err);
    process.exitCode = 1;
  })
  .finally(closePool);
