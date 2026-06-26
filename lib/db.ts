import { neon } from "@neondatabase/serverless";
import type { Nail, NailTags, Source, TagKey } from "./types";

// ─────────────────────────────────────────────────────────────────────────
//  Postgres (Neon) data-access layer. The gallery catalog and user accounts
//  live in Neon; images still live on R2. We use the Neon serverless (HTTP)
//  driver so it works in Next.js route handlers without connection pooling
//  headaches on Vercel.
//
//  Env: DATABASE_URL (Neon connection string).
// ─────────────────────────────────────────────────────────────────────────

const url = process.env.DATABASE_URL;

/** Tagged-template SQL client, or null when DATABASE_URL isn't set. */
export const sql = url ? neon(url) : null;

export function isDbConfigured(): boolean {
  return Boolean(sql);
}

function db(): NonNullable<typeof sql> {
  if (!sql) throw new Error("DATABASE_URL is not configured.");
  return sql;
}

// ── Designs ────────────────────────────────────────────────────────────────

const TAG_COLUMNS: TagKey[] = [
  "style",
  "color",
  "shape",
  "length",
  "occasion",
  "mood",
  "technique",
  "detail",
];

type DesignRow = {
  id: string;
  title: string | null;
  style: string | null;
  color: string | null;
  shape: string | null;
  length: string | null;
  occasion: string | null;
  mood: string | null;
  technique: string | null;
  detail: string | null;
  image_url: string | null;
  contributor: string | null;
  owner_id: string | null;
  source_platform: string | null;
  source_handle: string | null;
  source_url: string | null;
  status: string | null;
  caption: string | null;
  like_count: number | string | null;
  slug: string | null;
  alt_text: string | null;
};

function rowToNail(r: DesignRow): Nail {
  const tags = {} as NailTags;
  for (const k of TAG_COLUMNS) tags[k] = (r[k] as string | null) ?? "";
  const platform = r.source_platform === "user" ? "user" : "instagram";
  const source = {
    platform,
    handle: r.source_handle ?? "",
    url: r.source_url ?? undefined,
  } as Source;
  return {
    id: r.id,
    title: r.title ?? "",
    slug: r.slug ?? undefined,
    altText: r.alt_text ?? undefined,
    ...tags,
    imageUrl: r.image_url ?? undefined,
    caption: r.caption ?? undefined,
    contributor: r.contributor ?? undefined,
    ownerId: r.owner_id ?? undefined,
    likeCount: Number(r.like_count ?? 0),
    source,
    status: r.status === "pending" ? "pending" : "approved",
  };
}

/** Every design (pending + approved), newest first. */
export async function getAllDesigns(): Promise<Nail[]> {
  const rows = (await db()`
    SELECT * FROM designs ORDER BY created_at DESC NULLS LAST, id
  `) as DesignRow[];
  return rows.map(rowToNail);
}

// ── Cursor pagination (for the Home grid / future infinite scroll) ──────────
// Cursor = (created_at, id) of the last row, so it stays stable as rows are
// added (offset pagination would shift). Only the columns a card + the current
// client-side filters need are selected — never the heavy `description`.

export type DesignsPage = { items: Nail[]; nextCursor: string | null };

function encodeCursor(createdAt: string | Date, id: string): string {
  const iso = createdAt instanceof Date ? createdAt.toISOString() : new Date(createdAt).toISOString();
  return Buffer.from(`${iso}|${id}`).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const [iso, id] = Buffer.from(cursor, "base64url").toString().split("|");
    return iso && id ? { createdAt: iso, id } : null;
  } catch {
    return null;
  }
}

export async function getDesignsPage(limit = 24, cursor?: string): Promise<DesignsPage> {
  const lim = Math.min(Math.max(Math.trunc(limit) || 24, 1), 60);
  const cur = cursor ? decodeCursor(cursor) : null;
  const rows = (cur
    ? await db()`
        SELECT id, title, slug, image_url, alt_text, contributor,
               color, style, shape, length, occasion, mood, technique, detail,
               like_count, status, created_at
        FROM designs
        WHERE status <> 'pending'
          AND (created_at, id) < (${cur.createdAt}::timestamptz, ${cur.id})
        ORDER BY created_at DESC, id DESC
        LIMIT ${lim + 1}`
    : await db()`
        SELECT id, title, slug, image_url, alt_text, contributor,
               color, style, shape, length, occasion, mood, technique, detail,
               like_count, status, created_at
        FROM designs
        WHERE status <> 'pending'
        ORDER BY created_at DESC, id DESC
        LIMIT ${lim + 1}`) as (DesignRow & { created_at: string })[];

  const hasMore = rows.length > lim;
  const page = rows.slice(0, lim);
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeCursor(last.created_at, last.id) : null;
  return { items: page.map(rowToNail), nextCursor };
}

/** Designs uploaded by a given user, newest first. */
export async function getDesignsByOwner(ownerId: string): Promise<Nail[]> {
  const rows = (await db()`
    SELECT * FROM designs WHERE owner_id = ${ownerId}
    ORDER BY created_at DESC NULLS LAST, id
  `) as DesignRow[];
  return rows.map(rowToNail);
}

/** Insert one design (used by uploads/imports). */
export async function insertDesign(n: Nail): Promise<void> {
  await db()`
    INSERT INTO designs (
      id, title, style, color, shape, length, occasion, mood, technique, detail,
      image_url, contributor, owner_id, source_platform, source_handle, source_url,
      status, caption
    ) VALUES (
      ${n.id}, ${n.title ?? null}, ${n.style ?? null}, ${n.color ?? null},
      ${n.shape ?? null}, ${n.length ?? null}, ${n.occasion ?? null}, ${n.mood ?? null},
      ${n.technique ?? null}, ${n.detail ?? null}, ${n.imageUrl ?? null},
      ${n.contributor ?? null}, ${n.ownerId ?? null}, ${n.source?.platform ?? null},
      ${n.source?.handle ?? null}, ${n.source?.url ?? null}, ${n.status ?? "approved"},
      ${n.caption ?? null}
    )
    ON CONFLICT (id) DO NOTHING
  `;
}

/**
 * Replace the whole catalog to match `nails` (the client store still saves the
 * full array). Upserts every provided design and deletes any row not present,
 * all in one transaction. created_at is preserved on update.
 */
export async function replaceCatalog(nails: Nail[]): Promise<void> {
  const client = db();
  const upserts = nails.map(
    (n) => client`
      INSERT INTO designs (
        id, title, style, color, shape, length, occasion, mood, technique, detail,
        image_url, contributor, owner_id, source_platform, source_handle, source_url,
        status, caption
      ) VALUES (
        ${n.id}, ${n.title ?? null}, ${n.style ?? null}, ${n.color ?? null},
        ${n.shape ?? null}, ${n.length ?? null}, ${n.occasion ?? null}, ${n.mood ?? null},
        ${n.technique ?? null}, ${n.detail ?? null}, ${n.imageUrl ?? null},
        ${n.contributor ?? null}, ${n.ownerId ?? null}, ${n.source?.platform ?? null},
        ${n.source?.handle ?? null}, ${n.source?.url ?? null}, ${n.status ?? "approved"},
        ${n.caption ?? null}
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title, style = EXCLUDED.style, color = EXCLUDED.color,
        shape = EXCLUDED.shape, length = EXCLUDED.length, occasion = EXCLUDED.occasion,
        mood = EXCLUDED.mood, technique = EXCLUDED.technique, detail = EXCLUDED.detail,
        image_url = EXCLUDED.image_url, contributor = EXCLUDED.contributor,
        owner_id = EXCLUDED.owner_id, source_platform = EXCLUDED.source_platform,
        source_handle = EXCLUDED.source_handle, source_url = EXCLUDED.source_url,
        status = EXCLUDED.status, caption = EXCLUDED.caption
    `,
  );
  const ids = nails.map((n) => n.id);
  // Delete anything no longer in the array (handles removals + clear-all).
  const prune = client`DELETE FROM designs WHERE id <> ALL(${ids}::text[])`;
  await client.transaction([...upserts, prune]);
}

/** Delete one design by id (optionally constrained to an owner). Returns true if removed. */
export async function deleteDesign(id: string, ownerId?: string): Promise<boolean> {
  const rows = ownerId
    ? ((await db()`DELETE FROM designs WHERE id = ${id} AND owner_id = ${ownerId} RETURNING id`) as {
        id: string;
      }[])
    : ((await db()`DELETE FROM designs WHERE id = ${id} RETURNING id`) as { id: string }[]);
  return rows.length > 0;
}

/** Bump a design's like counter by ±1 (never below 0). Returns the new count, or null if not found. */
export async function adjustLike(id: string, delta: 1 | -1): Promise<number | null> {
  const rows = (await db()`
    UPDATE designs SET like_count = GREATEST(0, like_count + ${delta})
    WHERE id = ${id}
    RETURNING like_count
  `) as { like_count: number | string }[];
  return rows[0] ? Number(rows[0].like_count) : null;
}

/** Look up one design's image URL (used to clean up R2 on delete). */
export async function getDesignImageUrl(id: string): Promise<string | undefined> {
  const rows = (await db()`SELECT image_url FROM designs WHERE id = ${id}`) as {
    image_url: string | null;
  }[];
  return rows[0]?.image_url ?? undefined;
}

// ── Users ────────────────────────────────────────────────────────────────

export type DbUser = {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  createdAt: number;
};

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  salt: string;
  created_at: string | Date;
};

function rowToUser(r: UserRow): DbUser {
  return {
    id: r.id,
    username: r.username,
    passwordHash: r.password_hash,
    salt: r.salt,
    createdAt: new Date(r.created_at).getTime(),
  };
}

export async function findUserById(id: string): Promise<DbUser | null> {
  const rows = (await db()`SELECT * FROM users WHERE id = ${id}`) as UserRow[];
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function findUserByUsername(username: string): Promise<DbUser | null> {
  const rows = (await db()`SELECT * FROM users WHERE lower(username) = lower(${username})`) as UserRow[];
  return rows[0] ? rowToUser(rows[0]) : null;
}

export async function insertUser(u: DbUser): Promise<void> {
  await db()`
    INSERT INTO users (id, username, password_hash, salt, created_at)
    VALUES (${u.id}, ${u.username}, ${u.passwordHash}, ${u.salt}, ${new Date(u.createdAt).toISOString()})
  `;
}
