import { NextResponse } from "next/server";
import { clearSession } from "@/lib/auth";

// POST /api/auth/logout  ->  { ok }
export const runtime = "nodejs";

export async function POST() {
  await clearSession();
  return NextResponse.json({ ok: true });
}
