import crypto from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────
//  Admin session — a signed (HMAC) cookie, verified without a DB lookup so it
//  works inside proxy.ts (Node runtime) as well as route handlers.
//
//  Replaces the old HTTP Basic Auth gate: Basic sends `WWW-Authenticate`, which
//  makes the browser pop its native login dialog on ANY 401 in the /api/* space
//  — leaking the admin prompt onto public pages (which auto-fetch /api/catalog).
//  A cookie check never emits that header, so visitors are never challenged.
//
//  Credentials stay in ADMIN_USER / ADMIN_PASSWORD; the cookie is minted only
//  after they're verified at /api/auth/admin-login.
// ─────────────────────────────────────────────────────────────────────────

export const ADMIN_COOKIE = "naillib_admin";
export const ADMIN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function secret(): string {
  // Reuse the same secret scheme as the user-session signer (lib/auth.ts).
  return (
    process.env.AUTH_SECRET || process.env.R2_SECRET_ACCESS_KEY || "naillib-dev-insecure-secret"
  );
}

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

/** Constant-time string compare for equal-length secrets. */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function createAdminToken(): string {
  const payload = Buffer.from(`admin.${Date.now() + ADMIN_TTL_SECONDS * 1000}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const [, exp] = Buffer.from(payload, "base64url").toString().split(".");
    return Boolean(exp) && Number(exp) > Date.now();
  } catch {
    return false;
  }
}

/** True when the posted credentials match the configured admin login. */
export function checkAdminCredentials(user: string, pass: string): boolean {
  const U = process.env.ADMIN_USER;
  const P = process.env.ADMIN_PASSWORD;
  if (!U || !P) return false;
  return safeEqual(user, U) && safeEqual(pass, P);
}
