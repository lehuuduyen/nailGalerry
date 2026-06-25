import { NextResponse } from "next/server";
import { setSession, toPublic, verifyPassword } from "@/lib/auth";
import { findUserByUsername } from "@/lib/db";

// POST /api/auth/login  { username, password }  ->  { user }
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
  if (!username || !password) {
    return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  }

  const user = await findUserByUsername(username);
  // Same generic message whether the user exists or not.
  if (!user || !verifyPassword(password, user)) {
    return NextResponse.json({ error: "Wrong username or password." }, { status: 401 });
  }

  await setSession(user.id);
  return NextResponse.json({ user: toPublic(user) });
}
