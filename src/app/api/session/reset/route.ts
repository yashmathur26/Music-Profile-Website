import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { cookies } from "next/headers";
import { ensureSession } from "@/lib/db";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST() {
  const sessionId = nanoid();
  const cookieJar = cookies();
  cookieJar.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/"
  });
  await ensureSession(sessionId);
  return NextResponse.json({ sessionId });
}
