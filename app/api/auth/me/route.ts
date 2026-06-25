import { NextResponse } from "next/server";
import { currentUser, toPublic } from "@/lib/auth";

// GET /api/auth/me  ->  { user | null }
export const runtime = "nodejs";

export async function GET() {
  const user = await currentUser();
  return NextResponse.json({ user: user ? toPublic(user) : null });
}
