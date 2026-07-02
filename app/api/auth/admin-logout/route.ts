import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE } from "@/lib/admin-auth";

// POST /api/auth/admin-logout  ->  { ok }   Clears the admin session cookie.
export const runtime = "nodejs";

export async function POST() {
  (await cookies()).delete(ADMIN_COOKIE);
  return NextResponse.json({ ok: true });
}
