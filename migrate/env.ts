import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

// Load .env from the repo root. We also load .env.local as a fallback so the
// scripts work whether secrets live in .env or .env.local (Next uses .env.local).
loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local") });

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

/** R2 / Cloudflare config (always needed). */
export const r2 = {
  accountId: required("R2_ACCOUNT_ID"),
  accessKeyId: required("R2_ACCESS_KEY_ID"),
  secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
  bucket: process.env.R2_BUCKET || "nailgallery",
  // Spec uses R2_PUBLIC_BASE; this repo already has R2_PUBLIC_URL — accept either.
  publicBase: (process.env.R2_PUBLIC_BASE || process.env.R2_PUBLIC_URL || "").replace(/\/$/, ""),
};

/** Neon Postgres connection string — only required by DB scripts. */
export function databaseUrl(): string {
  return required("DATABASE_URL");
}
