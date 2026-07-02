import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/admin-auth";

// GET /api/auth/admin-me  ->  { admin: boolean }
// Lets the client (e.g. the Admin tab) know whether this browser holds a valid
// admin session cookie, without exposing the HttpOnly cookie to JS.
export const runtime = "nodejs";

export async function GET() {
  const admin = verifyAdminToken((await cookies()).get(ADMIN_COOKIE)?.value);
  return NextResponse.json({ admin }, { headers: { "Cache-Control": "private, no-store" } });
}
