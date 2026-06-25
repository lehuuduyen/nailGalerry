import crypto from "node:crypto";
import { cookies } from "next/headers";
import { findUserById, type DbUser } from "./db";

// ─────────────────────────────────────────────────────────────────────────
//  User accounts — stored in Neon Postgres (see lib/db.ts). Visitors can
//  register, log in, and manage the designs they've uploaded. Sessions are
//  stateless: a signed (HMAC) cookie carries the user id + expiry, verified on
//  every request.
//
//  Env:
//    AUTH_SECRET  secret used to sign session cookies. Falls back to the R2
//                 secret (already private) so the app works without extra
//                 setup, but set a dedicated value in production.
// ─────────────────────────────────────────────────────────────────────────

export const SESSION_COOKIE = "naillib_session";
const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days, in seconds

function secret(): string {
  return (
    process.env.AUTH_SECRET || process.env.R2_SECRET_ACCESS_KEY || "naillib-dev-insecure-secret"
  );
}

/** The user shape that's safe to send to the client (no secrets). */
export type PublicUser = { id: string; username: string };

export function toPublic(u: DbUser): PublicUser {
  return { id: u.id, username: u.username };
}

// ── Passwords ────────────────────────────────────────────────────────────

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

export function verifyPassword(password: string, user: DbUser): boolean {
  const candidate = Buffer.from(hashPassword(password, user.salt), "hex");
  const stored = Buffer.from(user.passwordHash, "hex");
  return candidate.length === stored.length && crypto.timingSafeEqual(candidate, stored);
}

export function newUser(username: string, password: string): DbUser {
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    id: `u-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`,
    username,
    salt,
    passwordHash: hashPassword(password, salt),
    createdAt: Date.now(),
  };
}

// ── Signed session token ─────────────────────────────────────────────────

function sign(value: string): string {
  return crypto.createHmac("sha256", secret()).update(value).digest("base64url");
}

function createToken(userId: string): string {
  const payload = Buffer.from(`${userId}.${Date.now() + SESSION_TTL * 1000}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifyToken(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const [userId, exp] = Buffer.from(payload, "base64url").toString().split(".");
    if (!userId || !exp || Number(exp) < Date.now()) return null;
    return userId;
  } catch {
    return null;
  }
}

// ── Session cookie helpers (Route Handlers / Server Actions only) ─────────

export async function setSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, createToken(userId), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Resolve the currently signed-in user from the session cookie, or null. */
export async function currentUser(): Promise<DbUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const userId = verifyToken(token);
  if (!userId) return null;
  return findUserById(userId);
}
