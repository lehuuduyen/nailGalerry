import { NextResponse } from "next/server";
import { newUser, setSession, toPublic } from "@/lib/auth";
import { findUserByUsername, insertUser, isDbConfigured } from "@/lib/db";

// POST /api/auth/register  { username, password }  ->  { user }
export const runtime = "nodejs";

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,20}$/;

export async function POST(req: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: "Accounts are not available right now." }, { status: 501 });
  }

  let body: { username?: string; password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "Username must be 3–20 letters, numbers, dot or underscore." },
      { status: 400 },
    );
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  if (await findUserByUsername(username)) {
    return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
  }

  const user = newUser(username, password);
  try {
    await insertUser(user);
  } catch {
    return NextResponse.json({ error: "Couldn't create your account. Try again." }, { status: 502 });
  }

  await setSession(user.id);
  return NextResponse.json({ user: toPublic(user) });
}
