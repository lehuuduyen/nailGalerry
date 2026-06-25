import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { r2 } from "./env";

// R2 is S3-compatible. region "auto" + the account-scoped endpoint.
export const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: r2.accessKeyId, secretAccessKey: r2.secretAccessKey },
});

export const BUCKET = r2.bucket;
export const PUBLIC_BASE = r2.publicBase;

/** Public URL for a stored object key. */
export function publicUrl(key: string): string {
  return `${PUBLIC_BASE}/${key}`;
}

/** True if a URL already points at our R2 public domain. */
export function isOnR2(url: string | undefined): boolean {
  if (!url) return false;
  if (PUBLIC_BASE && url.startsWith(PUBLIC_BASE)) return true;
  try {
    return /\.r2\.dev$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

async function streamToBuffer(body: unknown): Promise<Buffer> {
  // Node stream from the AWS SDK.
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Read an object as text, or null if it doesn't exist. */
export async function getText(key: string): Promise<string | null> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    if (!res.Body) return null;
    return (await streamToBuffer(res.Body)).toString("utf8");
  } catch (err) {
    if ((err as { name?: string }).name === "NoSuchKey") return null;
    throw err;
  }
}

/** Read + parse a JSON array object, or [] if missing. */
export async function getJsonArray<T = unknown>(key: string): Promise<T[]> {
  const text = await getText(key);
  if (!text) return [];
  const parsed = JSON.parse(text);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

/** Upload bytes to R2. */
export async function putObject(
  key: string,
  body: Buffer,
  contentType: string,
  cacheControl = "public, max-age=31536000, immutable",
): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    }),
  );
  return publicUrl(key);
}

/** True if an object key already exists in the bucket. */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}
