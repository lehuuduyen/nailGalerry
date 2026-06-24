import { AwsClient } from "aws4fetch";

// ─────────────────────────────────────────────────────────────────────────
//  Cloudflare R2 storage (S3-compatible). Cheapest option for serving images:
//  free egress + 10GB free storage. Used to persist imported Instagram photos
//  so they don't break when the Instagram CDN link expires.
//
//  Env (set in .env.local / Vercel project settings):
//    R2_ACCOUNT_ID         Cloudflare account id
//    R2_ACCESS_KEY_ID      R2 API token access key
//    R2_SECRET_ACCESS_KEY  R2 API token secret
//    R2_BUCKET             bucket name
//    R2_PUBLIC_URL         public base url (r2.dev domain or custom domain),
//                          e.g. https://pub-xxxx.r2.dev
// ─────────────────────────────────────────────────────────────────────────

const {
  R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY,
  R2_BUCKET,
  R2_PUBLIC_URL,
} = process.env;

export function isStorageConfigured(): boolean {
  return Boolean(
    R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_URL,
  );
}

function r2Client(): AwsClient {
  return new AwsClient({
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
  });
}

function r2Endpoint(key: string): string {
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${key}`;
}

/**
 * Upload bytes to R2 and return the public URL. Throws if not configured.
 * Images are cached forever (immutable); pass a different `cacheControl` for
 * mutable objects like the catalog so readers always get the latest version.
 */
export async function uploadToR2(
  key: string,
  body: ArrayBuffer,
  contentType: string,
  cacheControl = "public, max-age=31536000, immutable",
): Promise<string> {
  if (!isStorageConfigured()) throw new Error("R2 storage is not configured.");

  const res = await r2Client().fetch(r2Endpoint(key), {
    method: "PUT",
    body,
    headers: { "Content-Type": contentType, "Cache-Control": cacheControl },
  });

  if (!res.ok) {
    throw new Error(`R2 upload failed (${res.status}).`);
  }

  return `${R2_PUBLIC_URL!.replace(/\/$/, "")}/${key}`;
}

/** Read an object's bytes from R2. Returns null if it doesn't exist. */
export async function getFromR2(key: string): Promise<ArrayBuffer | null> {
  if (!isStorageConfigured()) throw new Error("R2 storage is not configured.");

  const res = await r2Client().fetch(r2Endpoint(key), { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 get failed (${res.status}).`);
  return res.arrayBuffer();
}

/** Delete an object from R2. A missing object is treated as success. */
export async function deleteFromR2(key: string): Promise<void> {
  if (!isStorageConfigured()) throw new Error("R2 storage is not configured.");

  const res = await r2Client().fetch(r2Endpoint(key), { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed (${res.status}).`);
}

/** Map a public R2 URL back to its object key, or null if it isn't one. */
export function keyFromPublicUrl(url: string): string | null {
  if (!R2_PUBLIC_URL) return null;
  const base = `${R2_PUBLIC_URL.replace(/\/$/, "")}/`;
  return url.startsWith(base) ? url.slice(base.length) : null;
}
