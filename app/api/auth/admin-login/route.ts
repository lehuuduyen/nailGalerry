import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE,
  ADMIN_TTL_SECONDS,
  checkAdminCredentials,
  createAdminToken,
} from "@/lib/admin-auth";

// POST /api/auth/admin-login  { username, password }  ->  { ok }
// Verifies ADMIN_USER / ADMIN_PASSWORD and sets the signed admin session cookie.
export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!checkAdminCredentials(username, password)) {
    return NextResponse.json({ error: "Wrong admin username or password." }, { status: 401 });
  }

  (await cookies()).set(ADMIN_COOKIE, createAdminToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_TTL_SECONDS,
  });
  return NextResponse.json({ ok: true });
}
